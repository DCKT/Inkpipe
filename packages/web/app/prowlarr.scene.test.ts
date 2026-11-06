import { Dialog } from "@foldkit/ui"
import {
  Command,
  Mount,
  click,
  expect as sceneExpect,
  given,
  label,
  role,
  scene,
  selector,
  submit,
  text,
  type,
} from "foldkit/scene"
import { describe, test } from "vitest"

import * as FolderSelect from "./folderSelect"
import { AppRoute, update, view } from "./main"
import * as Prowlarr from "./prowlarr"
import * as Results from "./results"
import { makeResult } from "./resultsFixtures"
import { drainToast, modelAt } from "./testing"

const a = makeResult({ guid: "a", title: "Berserk v05" })
const b = makeResult({ guid: "b", title: "Vagabond v03" })

const withPage = (page: Prowlarr.Model) => ({ ...modelAt(AppRoute.Prowlarr()), prowlarr: page })

const searched = (items = [a, b], selected: ReadonlyArray<string> = []): Prowlarr.Model => {
  const base = Prowlarr.init()
  const results = Results.setItems(base.results, items, Date.parse("2026-06-15T12:00:00.000Z"))
  return {
    ...base,
    queryInput: "berserk",
    search: Prowlarr.SearchState.Done({ query: "berserk" }),
    results: { ...results, selected },
  }
}

const openDialog = [
  click(role("button", { name: /^Download \d+ selected$/ })),
  Command.resolve(
    FolderSelect.FetchFolders,
    FolderSelect.Message.SucceededFetchFolders({ folders: ["manga"] }),
  ),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

describe("header and search form", () => {
  test("shows the numbered header and a hint before any search", () => {
    scene(
      { update, view },
      given(withPage(Prowlarr.init())),
      sceneExpect(role("heading", { name: "Search" })).toExist(),
      sceneExpect(text("I — PROWLARR")).toExist(),
      sceneExpect(text("Search for a book or comic to get started.")).toExist(),
    )
  })

  test("Search is disabled until something is typed, and typing enables it", () => {
    scene(
      { update, view },
      given(withPage(Prowlarr.init())),
      sceneExpect(role("button", { name: "Search" })).toBeDisabled(),
      type(label("Search for a book or comic"), "berserk"),
      sceneExpect(role("button", { name: "Search" })).toBeEnabled(),
    )
  })

  test("submitting runs the search and locks the form meanwhile", () => {
    scene(
      { update, view },
      given(withPage({ ...Prowlarr.init(), queryInput: "berserk" })),
      submit("form"),
      sceneExpect(role("button", { name: "Searching..." })).toBeDisabled(),
      Command.resolve(
        Prowlarr.SearchProwlarr,
        Prowlarr.Message.SucceededSearch({ query: "berserk", results: [a, b], nowMillis: 0 }),
      ),
      sceneExpect(text("2 results")).toExist(),
      sceneExpect(text("Berserk v05")).toExist(),
    )
  })
})

describe("search box and meta", () => {
  test("the search input has the id the focus Command targets and a helpful placeholder", () => {
    scene(
      { update, view },
      given(withPage(Prowlarr.init())),
      sceneExpect(selector(`#${Prowlarr.SEARCH_INPUT_ID}`)).toHaveAttr(
        "placeholder",
        "Search for a book or comic...",
      ),
    )
  })

  test("the result count appears only once a search has finished", () => {
    const searching = {
      ...searched(),
      search: Prowlarr.SearchState.Searching({ query: "berserk" }),
    }
    scene({ update, view }, given(withPage(searching)), sceneExpect(text("2 results")).toBeAbsent())
    scene({ update, view }, given(withPage(searched())), sceneExpect(text("2 results")).toExist())
  })

  test("the Search button is only as wide as its label", () => {
    scene(
      { update, view },
      given(withPage(Prowlarr.init())),
      sceneExpect(selector("form button[type='submit']")).not.toHaveClass("w-full"),
    )
  })
})

describe("outcomes", () => {
  test("a failure is shown as an alert", () => {
    scene(
      { update, view },
      given(
        withPage({
          ...Prowlarr.init(),
          search: Prowlarr.SearchState.Failed({ query: "x", reason: "Prowlarr is not configured" }),
        }),
      ),
      sceneExpect(role("alert")).toContainText("Prowlarr is not configured"),
    )
  })

  test("no matches says so, with the query", () => {
    scene(
      { update, view },
      given(withPage(searched([]))),
      sceneExpect(text('No results for "berserk".')).toExist(),
      sceneExpect(text("0 results")).toExist(),
    )
  })

  test("results render through the shared list", () => {
    scene(
      { update, view },
      given(withPage(searched())),
      sceneExpect(selector("[data-layout='table'] [data-guid='b']")).toExist(),
      sceneExpect(text("Vagabond v03")).toExist(),
    )
  })
})

describe("download flow", () => {
  test("the bar appears with a count once something is selected", () => {
    scene(
      { update, view },
      given(withPage(searched())),
      sceneExpect(role("button", { name: /^Download \d+ selected$/ })).toBeAbsent(),
      click(selector("#prowlarr-row-0")),
      sceneExpect(role("button", { name: "Download 1 selected" })).toExist(),
      click(selector("#prowlarr-row-1")),
      sceneExpect(role("button", { name: "Download 2 selected" })).toExist(),
    )
  })

  test("Download waits while a typed folder is still being checked", () => {
    const opened = Prowlarr.update(
      searched([a, b], ["a"]),
      Prowlarr.Message.ClickedDownload(),
    ).model
    const checking = Prowlarr.update(
      opened,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.ChangedInput({ value: "manga" }),
      }),
    ).model
    const checked = Prowlarr.update(
      checking,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.SucceededFetchFolders({ folders: ["manga"] }),
      }),
    ).model

    scene(
      { update, view },
      given(withPage(checking)),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("button", { name: "Download" })).toBeDisabled(),
    )
    scene(
      { update, view },
      given(withPage(checked)),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("button", { name: "Download" })).toBeEnabled(),
    )
  })

  test("opens a dialog titled with the count, offering the folder picker", () => {
    scene(
      { update, view },
      given(withPage(searched([a, b], ["a", "b"]))),
      ...openDialog,
      sceneExpect(role("dialog", { name: "Download 2 items" })).toExist(),
      sceneExpect(label("Subfolder (optional)")).toExist(),
      sceneExpect(selector("datalist#download-folder-suggestions option[value='manga']")).toExist(),
    )
  })

  test("the title is singular for one item", () => {
    scene(
      { update, view },
      given(withPage(searched([a, b], ["a"]))),
      ...openDialog,
      sceneExpect(role("dialog", { name: "Download 1 item" })).toExist(),
    )
  })

  test("confirming starts the download, and success toasts and clears the selection", () => {
    scene(
      { update, view },
      given(withPage(searched([a, b], ["a"]))),
      ...openDialog,
      type(label("Subfolder (optional)"), "manga"),
      click(role("button", { name: "Download" })),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.AcquireResources),
      sceneExpect(role("button", { name: "Starting..." })).toBeDisabled(),
      Command.resolve(Prowlarr.StartDownload, Prowlarr.Message.SucceededDownload({ started: 1 })),
      sceneExpect(role("button", { name: /^Download \d+ selected$/ })).toBeAbsent(),
      sceneExpect(role("status")).toContainText("Started 1 download"),
      sceneExpect(role("status")).toContainText("Check the Jobs page for progress."),
      drainToast("toasts-entry-0"),
    )
  })

  test("a failed download keeps the selection and shows an error toast", () => {
    scene(
      { update, view },
      given(withPage(searched([a, b], ["a"]))),
      ...openDialog,
      click(role("button", { name: "Download" })),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.AcquireResources),
      Command.resolve(
        Prowlarr.StartDownload,
        Prowlarr.Message.FailedDownload({ reason: "Copyparty unreachable" }),
      ),
      sceneExpect(role("button", { name: "Download 1 selected" })).toBeEnabled(),
      sceneExpect(role("alert")).toContainText("Copyparty unreachable"),
      drainToast("toasts-entry-0"),
    )
  })
})
