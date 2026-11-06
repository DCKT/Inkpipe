import { Option } from "effect"
import {
  Command,
  change,
  click,
  expect as sceneExpect,
  given,
  label,
  role,
  scene,
  submit,
  text,
  type,
} from "foldkit/scene"
import { describe, test } from "vitest"

import { AppRoute, update, view } from "./main"
import * as Settings from "./settings"
import { configWithKomga, loaded } from "./settingsFixtures"
import { drainToast, modelAt } from "./testing"

const settingsRoute = (isKomgaNotConfigured = false) =>
  AppRoute.Settings({
    komgaNotConfigured: isKomgaNotConfigured ? Option.some("true") : Option.none(),
  })

const withSettings = (settings: Settings.Model, route = settingsRoute()) => ({
  ...modelAt(route),
  settings,
})

describe("loading states", () => {
  test("shows a loading message while fetching", () => {
    scene(
      { update, view },
      given(withSettings(Settings.enter(false).model)),
      sceneExpect(text("Loading settings...")).toExist(),
    )
  })

  test("shows the failure reason when the load fails", () => {
    const failed = Settings.update(
      Settings.enter(false).model,
      Settings.Message.FailedFetchSettings({ reason: "db locked" }),
    ).model
    scene(
      { update, view },
      given(withSettings(failed)),
      sceneExpect(role("alert")).toContainText("Failed to load settings: db locked"),
      sceneExpect(role("button", { name: "Save Settings" })).toBeAbsent(),
    )
  })

  test("the Komga banner appears only when asked for", () => {
    scene(
      { update, view },
      given(withSettings({ ...loaded(), isKomgaNotConfigured: true })),
      sceneExpect(
        text("Komga is not configured yet. Please enter your Komga URL and API key below."),
      ).toExist(),
    )
    scene(
      { update, view },
      given(withSettings(loaded())),
      sceneExpect(
        text("Komga is not configured yet. Please enter your Komga URL and API key below."),
      ).toBeAbsent(),
    )
  })
})

describe("the form", () => {
  test("renders every section with the loaded values", () => {
    scene(
      { update, view },
      given(withSettings(loaded(configWithKomga))),
      sceneExpect(role("heading", { name: "Settings" })).toExist(),
      sceneExpect(label("Base URL")).toHaveValue("https://annas-archive.gl"),
      sceneExpect(label("Public URL")).toHaveValue(""),
      sceneExpect(label("Bot Token")).toHaveAttr("type", "password"),
      sceneExpect(label("Docker Image")).toExist(),
    )
  })

  test("typing updates the field", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      type(label("Public URL"), "https://inkpipe.example"),
      sceneExpect(label("Public URL")).toHaveValue("https://inkpipe.example"),
    )
  })

  test("the default library select explains why it is disabled", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      sceneExpect(label("Default Library")).toBeDisabled(),
      sceneExpect(text("Save URL & API key first")).toExist(),
    )
  })

  test("with credentials it lists the libraries and lets you pick one", () => {
    const ready = Settings.update(
      loaded(configWithKomga),
      Settings.Message.SucceededFetchLibraries({ libraries: [{ id: "L1", name: "Manga" }] }),
    ).model
    scene(
      { update, view },
      given(withSettings(ready)),
      sceneExpect(label("Default Library")).toBeEnabled(),
      sceneExpect(text("All libraries")).toExist(),
      sceneExpect(text("Manga")).toExist(),
    )
  })

  test("an invalid KCC number blocks saving and says why", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      sceneExpect(role("button", { name: "Save Settings" })).toBeEnabled(),
      type(label("Gamma"), "abc"),
      sceneExpect(role("alert")).toContainText("Enter a number ≥ 0.1"),
      sceneExpect(role("button", { name: "Save Settings" })).toBeDisabled(),
    )
  })
})

describe("library select wiring", () => {
  test("choosing a library writes the default library id", () => {
    const ready = Settings.update(
      loaded(configWithKomga),
      Settings.Message.SucceededFetchLibraries({ libraries: [{ id: "L1", name: "Manga" }] }),
    ).model
    scene(
      { update, view },
      given(withSettings(ready)),
      change(label("Default Library"), "L1"),
      sceneExpect(label("Default Library")).toHaveValue("L1"),
    )
  })

  test("Bot Token and Chat ID are separate inputs", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      type(label("Bot Token"), "tok"),
      type(label("Chat ID"), "42"),
      sceneExpect(label("Bot Token")).toHaveValue("tok"),
      sceneExpect(label("Chat ID")).toHaveValue("42"),
    )
  })
})

describe("blocked saves are explained", () => {
  test("a hint near Save says how many KCC fields to fix", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      sceneExpect(text("Fix 1 invalid KCC field to save.")).toBeAbsent(),
      type(label("Gamma"), "abc"),
      sceneExpect(text("Fix 1 invalid KCC field to save.")).toExist(),
      type(label("Target Size (KB, 0 = auto)"), "x"),
      sceneExpect(text("Fix 2 invalid KCC fields to save.")).toExist(),
    )
  })
})

describe("actions", () => {
  test("submitting saves, and the button reads Saving... meanwhile", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      submit("form"),
      sceneExpect(role("button", { name: "Saving..." })).toBeDisabled(),
      Command.resolve(Settings.SaveSettings, Settings.Message.FailedSaveSettings({ reason: "x" })),
      sceneExpect(role("button", { name: "Save Settings" })).toBeEnabled(),
      drainToast("toasts-entry-0"),
    )
  })

  test("export and import lock each other while one runs", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      click(role("button", { name: "Export Settings" })),
      sceneExpect(role("button", { name: "Import Settings" })).toBeDisabled(),
      Command.resolve(
        Settings.ExportSettings,
        Settings.Message.FailedExportSettings({ reason: "x" }),
      ),
      sceneExpect(role("button", { name: "Import Settings" })).toBeEnabled(),
      drainToast("toasts-entry-0"),
    )
  })

  test("the Telegram test button shows progress", () => {
    scene(
      { update, view },
      given(withSettings(loaded())),
      click(role("button", { name: "Send Test Message" })),
      sceneExpect(role("button", { name: "Sending..." })).toBeDisabled(),
      Command.resolve(Settings.TestTelegram, Settings.Message.FailedTestTelegram({ reason: "x" })),
      drainToast("toasts-entry-0"),
    )
  })
})
