import { Option } from "effect"
import { AsyncData } from "foldkit"
import { Command, given, message, model, story } from "foldkit/story"
import { describe, expect, test } from "vitest"

import * as Kcc from "./kccOptions"
import * as Settings from "./settings"
import { configWithKomga, defaultConfig, loaded } from "./settingsFixtures"

const formOf = (m: Settings.Model) => AsyncData.getData(m.form)

describe("enter", () => {
  test("starts loading and fetches settings", () => {
    const entered = Settings.enter(true)
    expect(AsyncData.isLoading(entered.model.form)).toBe(true)
    expect(entered.model.isKomgaNotConfigured).toBe(true)
    expect(entered.commands?.map((c) => c.name)).toStrictEqual(["FetchSettings"])
  })
})

describe("loading", () => {
  test("a loaded config fills both the saved copy and the draft", () => {
    const page = loaded()
    const form = Option.getOrThrow(formOf(page))
    expect(form.saved).toStrictEqual(defaultConfig)
    expect(form.draft).toStrictEqual(defaultConfig)
    expect(Kcc.isValid(form.kcc)).toBe(true)
  })

  test("without Komga credentials the libraries are not fetched", () => {
    const result = Settings.update(
      Settings.enter(false).model,
      Settings.Message.SucceededFetchSettings({ config: defaultConfig }),
    )
    expect(result.commands ?? []).toHaveLength(0)
    expect(AsyncData.isIdle(result.model.libraries)).toBe(true)
  })

  test("with Komga credentials the libraries are fetched", () => {
    story(
      Settings.update,
      given(Settings.enter(false).model),
      message(Settings.Message.SucceededFetchSettings({ config: configWithKomga })),
      Command.expectHas(Settings.FetchKomgaLibraries()),
      Command.resolve(
        Settings.FetchKomgaLibraries,
        Settings.Message.SucceededFetchLibraries({ libraries: [{ id: "L1", name: "Manga" }] }),
      ),
      model((m) => {
        expect(AsyncData.getData(m.libraries)).toStrictEqual(
          Option.some([{ id: "L1", name: "Manga" }]),
        )
      }),
    )
  })

  test("a failed load is shown as a failure, a failed library load as one too", () => {
    const failed = Settings.update(
      Settings.enter(false).model,
      Settings.Message.FailedFetchSettings({ reason: "boom" }),
    ).model
    expect(AsyncData.isFailure(failed.form)).toBe(true)
    const libs = Settings.update(
      loaded(configWithKomga),
      Settings.Message.FailedFetchLibraries({ reason: "x" }),
    ).model
    expect(AsyncData.isFailure(libs.libraries)).toBe(true)
  })
})

describe("editing", () => {
  test("typing changes only the draft, never the saved copy", () => {
    const page = Settings.update(
      loaded(),
      Settings.Message.ChangedText({ field: "prowlarr.url", value: "http://p" }),
    ).model
    const form = Option.getOrThrow(formOf(page))
    expect(form.draft.prowlarr.url).toBe("http://p")
    expect(form.saved.prowlarr.url).toBe("")
  })

  test("edits before the form has loaded are ignored", () => {
    const early = Settings.enter(false).model
    expect(
      Settings.update(early, Settings.Message.ChangedText({ field: "prowlarr.url", value: "x" }))
        .model,
    ).toStrictEqual(early)
  })

  test("KCC messages go to the KCC form", () => {
    const page = Settings.update(
      loaded(),
      Settings.Message.GotKccMessage({
        message: Kcc.Message.ChangedText({ field: "profile", value: "KPW5" }),
      }),
    ).model
    expect(Option.getOrThrow(formOf(page)).kcc.value.profile).toBe("KPW5")
  })
})

describe("saving", () => {
  test("sends the draft merged with the KCC form's value, once", () => {
    const edited = Settings.update(
      Settings.update(
        loaded(),
        Settings.Message.ChangedText({ field: "komga.url", value: "https://k" }),
      ).model,
      Settings.Message.GotKccMessage({
        message: Kcc.Message.ChangedText({ field: "profile", value: "KPW5" }),
      }),
    ).model

    const clicked = Settings.update(edited, Settings.Message.ClickedSave())
    expect(clicked.model.isSaving).toBe(true)
    expect(clicked.commands?.map((c) => c.name)).toStrictEqual(["SaveSettings"])
    expect(clicked.commands?.[0]?.args).toStrictEqual({
      config: {
        ...defaultConfig,
        komga: { ...defaultConfig.komga, url: "https://k" },
        kcc: { ...defaultConfig.kcc, profile: "KPW5" },
      },
    })

    expect(
      Settings.update(clicked.model, Settings.Message.ClickedSave()).commands ?? [],
    ).toHaveLength(0)
  })

  test("is blocked while a KCC number is invalid", () => {
    const broken = Settings.update(
      loaded(),
      Settings.Message.GotKccMessage({
        message: Kcc.Message.ChangedNumber({ field: "gamma", text: "abc" }),
      }),
    ).model
    const result = Settings.update(broken, Settings.Message.ClickedSave())
    expect(result.model.isSaving).toBe(false)
    expect(result.commands ?? []).toHaveLength(0)
  })

  test("is ignored before the form has loaded", () => {
    const result = Settings.update(Settings.enter(false).model, Settings.Message.ClickedSave())
    expect(result.model.isSaving).toBe(false)
    expect(result.commands ?? []).toHaveLength(0)
  })

  test("success updates the saved copy, clears the banner and tells the parent", () => {
    const saving = {
      ...Settings.update(loaded(), Settings.Message.ClickedSave()).model,
      isKomgaNotConfigured: true,
    }
    const result = Settings.update(
      saving,
      Settings.Message.SucceededSaveSettings({ config: configWithKomga }),
    )
    expect(result.model.isSaving).toBe(false)
    expect(result.model.isKomgaNotConfigured).toBe(false)
    expect(Option.getOrThrow(formOf(result.model)).saved).toStrictEqual(configWithKomga)
    expect(result.outMessage).toStrictEqual(Settings.OutMessage.SavedSettings())
    // new credentials make the library list loadable
    expect(result.commands?.map((c) => c.name)).toStrictEqual(["FetchKomgaLibraries"])
  })

  test("failure re-enables saving and asks for an error toast", () => {
    const result = Settings.update(
      { ...loaded(), isSaving: true },
      Settings.Message.FailedSaveSettings({ reason: "disk full" }),
    )
    expect(result.model.isSaving).toBe(false)
    expect(result.outMessage?._tag).toBe("RequestedToast")
  })
})

describe("telegram test", () => {
  test("runs once at a time and reports through toasts", () => {
    const started = Settings.update(loaded(), Settings.Message.ClickedTestTelegram())
    expect(started.model.isTestingTelegram).toBe(true)
    expect(started.commands?.map((c) => c.name)).toStrictEqual(["TestTelegram"])
    expect(
      Settings.update(started.model, Settings.Message.ClickedTestTelegram()).commands ?? [],
    ).toHaveLength(0)
    const ok = Settings.update(started.model, Settings.Message.SucceededTestTelegram())
    expect(ok.model.isTestingTelegram).toBe(false)
    expect(ok.outMessage?._tag).toBe("RequestedToast")
    const bad = Settings.update(
      started.model,
      Settings.Message.FailedTestTelegram({ reason: "nope" }),
    )
    expect(bad.model.isTestingTelegram).toBe(false)
    expect(bad.outMessage?._tag).toBe("RequestedToast")
  })
})

describe("export and import", () => {
  test("export is single-flight and toasts its result", () => {
    const started = Settings.update(loaded(), Settings.Message.ClickedExport())
    expect(started.commands?.map((c) => c.name)).toStrictEqual(["ExportSettings"])
    expect(
      Settings.update(started.model, Settings.Message.ClickedExport()).commands ?? [],
    ).toHaveLength(0)
    expect(
      Settings.update(started.model, Settings.Message.SucceededExportSettings()).model
        .isTransferring,
    ).toBe(false)
    expect(
      Settings.update(started.model, Settings.Message.FailedExportSettings({ reason: "x" }))
        .outMessage?._tag,
    ).toBe("RequestedToast")
  })

  test("import is blocked while an export or import runs", () => {
    const busy = Settings.update(loaded(), Settings.Message.ClickedExport()).model
    expect(Settings.update(busy, Settings.Message.ClickedImport()).commands ?? []).toHaveLength(0)
  })

  test("cancelling the file picker just unlocks the buttons", () => {
    const picking = Settings.update(loaded(), Settings.Message.ClickedImport())
    expect(picking.commands?.map((c) => c.name)).toStrictEqual(["ImportSettings"])
    const cancelled = Settings.update(picking.model, Settings.Message.CancelledImportSettings())
    expect(cancelled.model.isTransferring).toBe(false)
    expect(cancelled.outMessage).toBeUndefined()
  })

  test("a successful import reloads the form from the server", () => {
    const picking = Settings.update(loaded(configWithKomga), Settings.Message.ClickedImport()).model
    const done = Settings.update(picking, Settings.Message.SucceededImportSettings())
    expect(done.model.isTransferring).toBe(false)
    expect(AsyncData.isLoading(done.model.form)).toBe(true)
    expect(AsyncData.isIdle(done.model.libraries)).toBe(true)
    expect(done.commands?.map((c) => c.name)).toStrictEqual(["FetchSettings"])
    expect(done.outMessage).toStrictEqual(Settings.OutMessage.ImportedSettings())
  })

  test("a failed import keeps the form and reports why", () => {
    const picking = Settings.update(loaded(), Settings.Message.ClickedImport()).model
    const failed = Settings.update(
      picking,
      Settings.Message.FailedImportSettings({ reason: "The file is not valid JSON" }),
    )
    expect(failed.model.isTransferring).toBe(false)
    expect(AsyncData.hasData(failed.model.form)).toBe(true)
    expect(failed.outMessage?._tag).toBe("RequestedToast")
  })
})

describe("late loads", () => {
  test("a second settings response never overwrites edits already made", () => {
    const edited = Settings.update(
      loaded(),
      Settings.Message.ChangedText({ field: "prowlarr.url", value: "http://typed" }),
    ).model
    const late = Settings.update(
      edited,
      Settings.Message.SucceededFetchSettings({ config: defaultConfig }),
    )
    expect(late.model).toStrictEqual(edited)
    expect(late.commands ?? []).toHaveLength(0)
  })
})

describe("librarySelectState", () => {
  test("is decided by the saved credentials, not by what is typed", () => {
    const typed = Settings.update(
      loaded(),
      Settings.Message.ChangedText({ field: "komga.url", value: "https://typed" }),
    ).model
    const typedMore = Settings.update(
      typed,
      Settings.Message.ChangedText({ field: "komga.apiKey", value: "typed" }),
    ).model
    const form = Option.getOrThrow(formOf(typedMore))
    expect(Settings.librarySelectState(form, typedMore.libraries)).toStrictEqual({
      kind: "NoCredentials",
    })
  })

  const form = (config = defaultConfig) => Option.getOrThrow(formOf(loaded(config)))

  test("needs saved credentials first, regardless of what is typed", () => {
    expect(Settings.librarySelectState(form(), loaded().libraries)).toStrictEqual({
      kind: "NoCredentials",
    })
  })

  test("loading, failed and ready", () => {
    const withCreds = form(configWithKomga)
    const base = loaded(configWithKomga)
    expect(Settings.librarySelectState(withCreds, base.libraries).kind).toBe("Loading")
    const failed = Settings.update(
      base,
      Settings.Message.FailedFetchLibraries({ reason: "x" }),
    ).model
    expect(Settings.librarySelectState(withCreds, failed.libraries).kind).toBe("Failed")
    const ready = Settings.update(
      base,
      Settings.Message.SucceededFetchLibraries({ libraries: [{ id: "1", name: "A" }] }),
    ).model
    expect(Settings.librarySelectState(withCreds, ready.libraries)).toStrictEqual({
      kind: "Ready",
      libraries: [{ id: "1", name: "A" }],
    })
  })
})
