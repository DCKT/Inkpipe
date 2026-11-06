import { FileDrop } from "@foldkit/ui"
import { KccConfigSchema } from "@inkpipe/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { AsyncData } from "foldkit"
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
} from "foldkit/scene"
import { fromString as parseUrl } from "foldkit/url"
import { afterEach, describe, expect, test, vi } from "vitest"

import { ApiClientService } from "./api"
import * as Convert from "./convert"
import * as Kcc from "./kccOptions"
import { AppRoute, init, update, view } from "./main"
import { drainToast, modelAt } from "./testing"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const defaults = Option.getOrThrowWith(
  Schema.decodeUnknownOption(KccConfigSchema)({}),
  () => new globalThis.Error("defaults must decode"),
)
const configured = { ...defaults, dockerImage: "ghcr.io/ciromattia/kcc:latest" }
const cbz = new File(["x"], "Berserk v01.cbz")

const ready = (): Convert.Model => {
  const entered = Convert.enter(Convert.init()).model
  return Convert.update(entered, Convert.Message.SucceededFetchDefaults({ kcc: configured })).model
}

const withFile = (): Convert.Model => ({ ...ready(), maybeFile: Option.some(cbz) })

const drop = (model: Convert.Model, first: File, ...rest: Array<File>) =>
  Convert.update(
    model,
    Convert.Message.GotFileDropMessage({
      message: FileDrop.Message.DroppedFiles({ files: [first, ...rest] }),
    }),
  ).model

describe("entering", () => {
  test("loads the saved KCC defaults", () => {
    const entered = Convert.enter(Convert.init())
    expect(AsyncData.isLoading(entered.model.defaults)).toBe(true)
    expect(entered.commands?.map((c) => c.name)).toStrictEqual(["FetchDefaults"])
  })

  test("a configured Docker image fills the options form with the defaults", () => {
    const model = ready()
    expect(Option.isSome(model.kcc)).toBe(true)
    expect(Convert.isAtDefaults(model)).toBe(true)
  })

  test("with no Docker image, the user is sent to Settings", () => {
    const result = Convert.update(
      Convert.enter(Convert.init()).model,
      Convert.Message.SucceededFetchDefaults({ kcc: { ...defaults, dockerImage: "" } }),
    )
    expect(result.outMessage).toStrictEqual(Convert.OutMessage.RequestedSettings())
    expect(Option.isNone(result.model.kcc)).toBe(true)
  })

  test("returning to the page keeps options the user already changed", () => {
    const edited = Convert.update(
      ready(),
      Convert.Message.GotKccMessage({
        message: Kcc.Message.ChangedText({ field: "profile", value: "KPW5" }),
      }),
    ).model
    const again = Convert.update(
      edited,
      Convert.Message.SucceededFetchDefaults({ kcc: configured }),
    ).model
    expect(Option.getOrThrow(again.kcc).value.profile).toBe("KPW5")
  })

  test("a failed load is shown, not swallowed", () => {
    const failed = Convert.update(
      Convert.enter(Convert.init()).model,
      Convert.Message.FailedFetchDefaults({ reason: "db" }),
    ).model
    expect(AsyncData.isFailure(failed.defaults)).toBe(true)
  })
})

describe("options", () => {
  test("Reset restores the saved defaults, and is only offered when something changed", () => {
    const edited = Convert.update(
      ready(),
      Convert.Message.GotKccMessage({
        message: Kcc.Message.ChangedText({ field: "profile", value: "KPW5" }),
      }),
    ).model
    expect(Convert.isAtDefaults(edited)).toBe(false)
    const reset = Convert.update(edited, Convert.Message.ClickedResetKcc()).model
    expect(Convert.isAtDefaults(reset)).toBe(true)
    expect(Option.getOrThrow(reset.kcc).value.profile).toBe(configured.profile)
  })
})

describe("choosing a file", () => {
  test("a .cbz is accepted (any case) and a problem message is cleared", () => {
    const problem = drop(ready(), new File(["x"], "notes.txt"))
    expect(Option.isSome(problem.maybeFileProblem)).toBe(true)
    const accepted = drop(problem, new File(["x"], "BOOK.CBZ"))
    expect(Option.map(accepted.maybeFile, (f) => f.name)).toStrictEqual(Option.some("BOOK.CBZ"))
    expect(Option.isNone(accepted.maybeFileProblem)).toBe(true)
  })

  test("anything else is refused with an explanation and keeps the previous file", () => {
    const withOld = withFile()
    const refused = drop(withOld, new File(["x"], "cover.png"))
    expect(Option.map(refused.maybeFile, (f) => f.name)).toStrictEqual(
      Option.some("Berserk v01.cbz"),
    )
    expect(refused.maybeFileProblem).toStrictEqual(Option.some("Only .cbz files can be converted."))
  })

  test("with several files, the first .cbz wins", () => {
    const picked = drop(
      ready(),
      new File(["x"], "a.png"),
      new File(["x"], "b.cbz"),
      new File(["x"], "c.cbz"),
    )
    expect(Option.map(picked.maybeFile, (f) => f.name)).toStrictEqual(Option.some("b.cbz"))
  })

  test("file sizes are shown in KB below a megabyte, MB above", () => {
    expect(Convert.formatFileSize(512)).toBe("0.5 KB")
    expect(Convert.formatFileSize(1024 * 1024)).toBe("1.0 MB")
    expect(Convert.formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB")
  })
})

describe("the conversion", () => {
  test("converting uploads the file with the current options as JSON", () => {
    const started = Convert.update(withFile(), Convert.Message.ClickedConvert())
    expect(started.model.stage._tag).toBe("Uploading")
    const upload = started.commands?.[0]
    expect(upload?.name).toBe("UploadFile")
    expect(upload?.args).toMatchObject({ file: cbz, options: Option.some(expect.any(String)) })
  })

  test("nothing happens without a file, while busy, or with an invalid number", () => {
    expect(Convert.update(ready(), Convert.Message.ClickedConvert()).commands ?? []).toHaveLength(0)
    const busy = Convert.update(withFile(), Convert.Message.ClickedConvert()).model
    expect(Convert.update(busy, Convert.Message.ClickedConvert()).commands ?? []).toHaveLength(0)
    const broken = Convert.update(
      withFile(),
      Convert.Message.GotKccMessage({
        message: Kcc.Message.ChangedNumber({ field: "gamma", text: "x" }),
      }),
    ).model
    expect(Convert.update(broken, Convert.Message.ClickedConvert()).commands ?? []).toHaveLength(0)
  })

  test("upload → convert → save → done, one step at a time", () => {
    let m = Convert.update(withFile(), Convert.Message.ClickedConvert()).model
    const converting = Convert.update(m, Convert.Message.SucceededUpload({ id: "j1" }))
    expect(converting.model.stage).toStrictEqual(Convert.Stage.Converting({ id: "j1" }))
    expect(converting.commands?.[0]?.name).toBe("AwaitConversion")
    m = converting.model
    const saving = Convert.update(
      m,
      Convert.Message.SucceededConversion({ id: "j1", filename: "b.epub" }),
    )
    expect(saving.model.stage).toStrictEqual(Convert.Stage.Saving({ id: "j1", filename: "b.epub" }))
    expect(saving.commands?.[0]?.name).toBe("SaveConvertedFile")
    const done = Convert.update(
      saving.model,
      Convert.Message.SucceededSaveFile({
        filename: "b.epub",
      }),
    )
    expect(done.model.stage._tag).toBe("Done")
    expect(Option.isNone(done.model.maybeFile)).toBe(true)
    expect(done.commands?.map((c) => c.name)).toStrictEqual(["WaitBeforeReset"])
    expect(done.outMessage?._tag === "RequestedToast" && done.outMessage.request).toMatchObject({
      variant: "Success",
      title: "Conversion complete",
      maybeDescription: Option.some("b.epub"),
    })
  })

  test("results for a job we're not waiting on are ignored", () => {
    const idle = ready()
    expect(Convert.update(idle, Convert.Message.SucceededUpload({ id: "j" })).model).toStrictEqual(
      idle,
    )
    const converting = Convert.update(
      Convert.update(withFile(), Convert.Message.ClickedConvert()).model,
      Convert.Message.SucceededUpload({ id: "j1" }),
    ).model
    expect(
      Convert.update(
        converting,
        Convert.Message.SucceededConversion({ id: "other", filename: "x" }),
      ).model,
    ).toStrictEqual(converting)
    expect(
      Convert.update(idle, Convert.Message.FailedConversion({ reason: "late" })).model,
    ).toStrictEqual(idle)
  })

  test("a failure at any step shows the reason, toasts it, and Try again returns to the start", () => {
    const uploading = Convert.update(withFile(), Convert.Message.ClickedConvert()).model
    const failed = Convert.update(
      uploading,
      Convert.Message.FailedConversion({ reason: "KCC exploded" }),
    )
    expect(failed.model.stage).toStrictEqual(Convert.Stage.Failed({ reason: "KCC exploded" }))
    expect(failed.outMessage?._tag === "RequestedToast" && failed.outMessage.request).toMatchObject(
      {
        variant: "Error",
        title: "Conversion failed",
        maybeDescription: Option.some("KCC exploded"),
      },
    )
    const again = Convert.update(failed.model, Convert.Message.ClickedTryAgain()).model
    expect(again.stage._tag).toBe("Idle")
    expect(Option.isNone(again.maybeFile)).toBe(true)
  })

  test("the success panel resets itself, but only if it is still showing", () => {
    const done = {
      ...ready(),
      stage: Convert.Stage.Done({ filename: "b.epub" }),
    }
    expect(Convert.update(done, Convert.Message.CompletedWaitBeforeReset()).model.stage._tag).toBe(
      "Idle",
    )
    const failed = { ...ready(), stage: Convert.Stage.Failed({ reason: "x" }) }
    expect(Convert.update(failed, Convert.Message.CompletedWaitBeforeReset()).model).toStrictEqual(
      failed,
    )
  })
})

describe("more of the state machine", () => {
  test("a failure while saving the file ends in Failed, not a stuck spinner", () => {
    const saving = { ...withFile(), stage: Convert.Stage.Saving({ id: "j", filename: "b.epub" }) }
    const failed = Convert.update(saving, Convert.Message.FailedConversion({ reason: "disk full" }))
    expect(failed.model.stage).toStrictEqual(Convert.Stage.Failed({ reason: "disk full" }))
  })

  test("a failure while converting ends in Failed too", () => {
    const converting = { ...withFile(), stage: Convert.Stage.Converting({ id: "j" }) }
    expect(
      Convert.update(converting, Convert.Message.FailedConversion({ reason: "x" })).model.stage
        ._tag,
    ).toBe("Failed")
  })

  test("the options sent are exactly the form's current values", () => {
    const edited = Convert.update(
      withFile(),
      Convert.Message.GotKccMessage({
        message: Kcc.Message.ChangedText({ field: "profile", value: "KPW5" }),
      }),
    ).model
    const upload = Convert.update(edited, Convert.Message.ClickedConvert()).commands?.[0]
    const sent = upload?.args && "options" in upload.args ? upload.args.options : Option.none()
    expect(Option.map(sent as Option.Option<string>, (json) => JSON.parse(json))).toStrictEqual(
      Option.some({ ...configured, profile: "KPW5" }),
    )
  })

  test("a refresh keeps untouched options current but never overwrites edits", () => {
    const changed = { ...configured, profile: "NewDevice" }
    const untouched = Convert.update(
      Convert.enter(ready()).model,
      Convert.Message.SucceededFetchDefaults({ kcc: changed }),
    ).model
    expect(Option.getOrThrow(untouched.kcc).value.profile).toBe("NewDevice")
    expect(Convert.isAtDefaults(untouched)).toBe(true)

    const edited = Convert.update(
      ready(),
      Convert.Message.GotKccMessage({
        message: Kcc.Message.ChangedText({ field: "profile", value: "Mine" }),
      }),
    ).model
    const kept = Convert.update(
      Convert.enter(edited).model,
      Convert.Message.SucceededFetchDefaults({ kcc: changed }),
    ).model
    expect(Option.getOrThrow(kept.kcc).value.profile).toBe("Mine")
  })

  test("re-entering keeps the stage and chosen file", () => {
    const working = { ...withFile(), stage: Convert.Stage.Converting({ id: "j" }) }
    const again = Convert.enter(working).model
    expect(again.stage).toStrictEqual(working.stage)
    expect(Option.isSome(again.maybeFile)).toBe(true)
  })
})

describe("SaveConvertedFile", () => {
  test("fetches the result, saves it under the converted name, and reports success", async () => {
    const urls: Array<string> = []
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url)
      return new Response("epub", { status: 200 })
    })
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const saved: Array<string> = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })

    const message = await Effect.runPromise(
      Convert.SaveConvertedFile({ id: "j 1", filename: "b.epub" }).effect.pipe(
        Effect.provide(Layer.empty),
      ),
    )

    expect(message).toStrictEqual(Convert.Message.SucceededSaveFile({ filename: "b.epub" }))
    expect(urls).toHaveLength(1)
    expect(urls[0]?.endsWith("/api/convert/download?id=j%201")).toBe(true)
    expect(saved).toStrictEqual(["b.epub"])
  })

  test("a failed fetch saves nothing and reports why", async () => {
    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

    const message = await Effect.runPromise(
      Convert.SaveConvertedFile({ id: "j", filename: "b.epub" }).effect,
    )

    expect(message).toStrictEqual(
      Convert.Message.FailedConversion({ reason: "The server answered 404" }),
    )
    expect(click).not.toHaveBeenCalled()
  })
})

describe("Commands (against a stubbed API)", () => {
  test("FetchDefaults success and failure", async () => {
    const run = (status: number, body: unknown) => {
      const httpClient = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
              }),
            ),
          ),
        ),
      )
      const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
      return Effect.runPromise(Convert.FetchDefaults().effect.pipe(Effect.provide(layer)))
    }
    const ok = await run(200, {})
    expect(ok._tag === "SucceededFetchDefaults" && ok.kcc.profile).toBe(defaults.profile)
    expect(await run(500, { _tag: "ConfigLoadError", message: "db" })).toStrictEqual(
      Convert.Message.FailedFetchDefaults({ reason: "db" }),
    )
  })
})

const withPage = (page: Convert.Model) => ({ ...modelAt(AppRoute.Convert()), convert: page })

describe("view", () => {
  test("header, options and the drop zone", () => {
    scene(
      { update, view },
      given(withPage(ready())),
      sceneExpect(text("V — CONVERT")).toExist(),
      sceneExpect(role("heading", { name: "Convert CBZ to EPUB" })).toExist(),
      sceneExpect(label("Profile")).toExist(),
      sceneExpect(label("Docker Image")).toBeAbsent(),
      sceneExpect(text("Drop your .cbz file here")).toExist(),
      sceneExpect(role("button", { name: "Convert to EPUB" })).toBeAbsent(),
    )
  })

  test("the options area explains loading and failures", () => {
    scene(
      { update, view },
      given(withPage(Convert.enter(Convert.init()).model)),
      sceneExpect(text("Loading options…")).toExist(),
    )
    const failed = Convert.update(
      Convert.init(),
      Convert.Message.FailedFetchDefaults({ reason: "db" }),
    ).model
    scene({ update, view }, given(withPage(failed)), sceneExpect(role("alert")).toContainText("db"))
  })

  test("a chosen file shows its name and size and offers Convert", () => {
    scene(
      { update, view },
      given(withPage(withFile())),
      sceneExpect(selector("[data-file-name]")).toHaveText("Berserk v01.cbz"),
      sceneExpect(role("button", { name: "Convert to EPUB" })).toBeEnabled(),
    )
  })

  test("Reset to defaults is disabled until an option changes", () => {
    scene(
      { update, view },
      given(withPage(ready())),
      sceneExpect(role("button", { name: "Reset to defaults" })).toBeDisabled(),
      type(label("Profile"), "KPW5"),
      sceneExpect(role("button", { name: "Reset to defaults" })).toBeEnabled(),
      click(role("button", { name: "Reset to defaults" })),
      sceneExpect(label("Profile")).toHaveValue(configured.profile),
    )
  })

  test("each stage has its own panel", () => {
    const at = (stage: Convert.Stage) => withPage({ ...withFile(), stage })
    scene(
      { update, view },
      given(at(Convert.Stage.Uploading())),
      sceneExpect(text("Uploading...")).toExist(),
    )
    scene(
      { update, view },
      given(at(Convert.Stage.Converting({ id: "j" }))),
      sceneExpect(text("Converting with KCC...")).toExist(),
    )
    scene(
      { update, view },
      given(at(Convert.Stage.Saving({ id: "j", filename: "b.epub" }))),
      sceneExpect(text("Preparing your download...")).toExist(),
    )
    scene(
      { update, view },
      given(at(Convert.Stage.Done({ filename: "b.epub" }))),
      sceneExpect(text("Download started — b.epub")).toExist(),
      sceneExpect(selector("main a")).toBeAbsent(),
    )
  })

  test("a failure offers Try again", () => {
    scene(
      { update, view },
      given(withPage({ ...withFile(), stage: Convert.Stage.Failed({ reason: "KCC exploded" }) })),
      sceneExpect(role("alert")).toContainText("KCC exploded"),
      click(role("button", { name: "Try again" })),
      sceneExpect(text("Drop your .cbz file here")).toExist(),
    )
  })

  test("converting walks through the stages and toasts on success", () => {
    scene(
      { update, view },
      given(withPage(withFile())),
      click(role("button", { name: "Convert to EPUB" })),
      sceneExpect(text("Uploading...")).toExist(),
      Command.resolve(Convert.UploadFile, Convert.Message.SucceededUpload({ id: "j1" })),
      sceneExpect(text("Converting with KCC...")).toExist(),
      Command.resolve(
        Convert.AwaitConversion,
        Convert.Message.SucceededConversion({ id: "j1", filename: "b.epub" }),
      ),
      Command.resolve(
        Convert.SaveConvertedFile,
        Convert.Message.SucceededSaveFile({ filename: "b.epub" }),
      ),
      sceneExpect(text("Download started — b.epub")).toExist(),
      sceneExpect(selector("#toasts [role='status']")).toContainText("Conversion complete"),
      Command.resolve(Convert.WaitBeforeReset, Convert.Message.CompletedWaitBeforeReset()),
      drainToast("toasts-entry-0"),
    )
  })
})

describe("wiring", () => {
  const names = (path: string) =>
    init(Option.getOrThrow(parseUrl(`http://localhost${path}`))).commands?.map((c) => c.name) ?? []

  test("a cold load on /convert fetches the defaults; elsewhere it doesn't", () => {
    expect(names("/convert")).toContain("FetchDefaults")
    expect(names("/watches")).not.toContain("FetchDefaults")
  })

  test("navigating to /convert from elsewhere loads once; a missing Docker image sends you to Settings", () => {
    const url = Option.getOrThrow(parseUrl("http://localhost/convert"))
    const entered = update(modelAt(AppRoute.Watches()), { _tag: "ChangedUrl", url })
    expect(entered.commands?.map((c) => c.name)).toContain("FetchDefaults")
    const redirected = update(entered.model, {
      _tag: "GotConvertMessage",
      message: Convert.Message.SucceededFetchDefaults({ kcc: { ...defaults, dockerImage: "" } }),
    })
    const navigate = redirected.commands?.find((c) => c.name === "NavigateInternal")
    expect(navigate?.args).toStrictEqual({ url: "/settings" })
  })

  test("the redirect is dropped if the user already left the page", () => {
    const away = modelAt(AppRoute.Watches())
    const result = update(away, {
      _tag: "GotConvertMessage",
      message: Convert.Message.SucceededFetchDefaults({ kcc: { ...defaults, dockerImage: "" } }),
    })
    expect(result.commands?.map((c) => c.name) ?? []).not.toContain("NavigateInternal")
  })
})
