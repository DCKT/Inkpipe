import { Dialog } from "@foldkit/ui"
import { Effect, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
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
import { fromString as parseUrl } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as AnnasArchive from "./annasArchive"
import { makeBook } from "./annasFixtures"
import * as Books from "./annasResults"
import * as FolderSelect from "./folderSelect"
import { AppRoute, Message, init, update, view } from "./main"
import { requestJson } from "./testHttp"
import { drainToast, modelAt } from "./testing"

const a = makeBook({ md5: "a", title: "Dune" })
const b = makeBook({ md5: "b", title: "Emma" })
const base = AnnasArchive.init()

const withResults = (selected: ReadonlyArray<string> = []): AnnasArchive.Model => {
  const results = Books.setItems(base.results, [a, b])
  return {
    ...base,
    queryInput: "dune",
    search: AnnasArchive.SearchState.Done({ query: "dune" }),
    results: { ...results, selected },
  }
}

const open = (page: AnnasArchive.Model) =>
  AnnasArchive.update(page, AnnasArchive.Message.ClickedDownload()).model

describe("searching", () => {
  test("entering focuses the search box", () => {
    expect(AnnasArchive.enter(base).commands?.map((c) => c.name)).toStrictEqual([
      "FocusAnnasSearch",
    ])
  })

  test("submitting searches for the trimmed text and empties the old list", () => {
    const page = { ...withResults(["a"]), queryInput: "  emma " }
    const result = AnnasArchive.update(page, AnnasArchive.Message.SubmittedSearch())
    expect(result.model.search).toStrictEqual(AnnasArchive.SearchState.Searching({ query: "emma" }))
    expect(result.model.results.items).toStrictEqual([])
    expect(result.commands?.[0]?.args).toStrictEqual({ query: "emma" })
  })

  test("blank input and a second submit while searching do nothing", () => {
    expect(
      AnnasArchive.update({ ...base, queryInput: "  " }, AnnasArchive.Message.SubmittedSearch())
        .commands ?? [],
    ).toHaveLength(0)
    const searching = AnnasArchive.update(
      { ...base, queryInput: "x" },
      AnnasArchive.Message.SubmittedSearch(),
    ).model
    expect(
      AnnasArchive.update(searching, AnnasArchive.Message.SubmittedSearch()).commands ?? [],
    ).toHaveLength(0)
  })

  test("only the answer to the current search counts", () => {
    const searching = AnnasArchive.update(
      { ...base, queryInput: "new" },
      AnnasArchive.Message.SubmittedSearch(),
    ).model
    expect(
      AnnasArchive.update(
        searching,
        AnnasArchive.Message.SucceededSearch({ query: "old", results: [a] }),
      ).model,
    ).toStrictEqual(searching)
    expect(
      AnnasArchive.update(
        searching,
        AnnasArchive.Message.FailedSearch({ query: "old", reason: "x" }),
      ).model,
    ).toStrictEqual(searching)
    const done = AnnasArchive.update(
      searching,
      AnnasArchive.Message.SucceededSearch({ query: "new", results: [a, b] }),
    ).model
    expect(done.search).toStrictEqual(AnnasArchive.SearchState.Done({ query: "new" }))
    expect(done.results.items).toHaveLength(2)
  })

  test("a failure shows the reason", () => {
    const searching = AnnasArchive.update(
      { ...base, queryInput: "x" },
      AnnasArchive.Message.SubmittedSearch(),
    ).model
    const failed = AnnasArchive.update(
      searching,
      AnnasArchive.Message.FailedSearch({ query: "x", reason: "Anna's Archive is down" }),
    ).model
    expect(failed.search).toStrictEqual(
      AnnasArchive.SearchState.Failed({ query: "x", reason: "Anna's Archive is down" }),
    )
  })
})

describe("downloading", () => {
  const startArgs = (page: AnnasArchive.Model) =>
    AnnasArchive.update(page, AnnasArchive.Message.ConfirmedDownload()).commands?.find(
      (c) => c.name === "StartAnnasDownload",
    )?.args
  const folderMsg = (page: AnnasArchive.Model, message: FolderSelect.Message) =>
    AnnasArchive.update(page, AnnasArchive.Message.GotFolderMessage({ message })).model

  test("nothing selected: nothing opens", () => {
    expect(
      AnnasArchive.update(withResults(), AnnasArchive.Message.ClickedDownload()).model
        .downloadDialog.isOpen,
    ).toBe(false)
    expect(
      AnnasArchive.update(withResults(), AnnasArchive.Message.ConfirmedDownload()).commands ?? [],
    ).toHaveLength(0)
  })

  test("opening starts with an empty folder and refreshes the list", () => {
    const stale = { ...withResults(["a"]), folder: { ...base.folder, input: "old" } }
    const opened = AnnasArchive.update(stale, AnnasArchive.Message.ClickedDownload())
    expect(opened.model.folder.input).toBe("")
    expect(opened.commands?.map((c) => c.name)).toContain("FetchFolders")
  })

  test("no folder: sends the selected books in list order with no folder fields", () => {
    expect(startArgs(open(withResults(["b", "a"])))).toStrictEqual({
      items: [a, b],
      subfolder: Option.none(),
      newFolder: Option.none(),
    })
  })

  test("a typed folder waits for the list, then is sent with the right 'new' flag", () => {
    const typing = folderMsg(
      open(withResults(["a"])),
      FolderSelect.Message.ChangedInput({ value: "manga" }),
    )
    expect(AnnasArchive.isFolderUnsettled(typing)).toBe(true)
    expect(startArgs(typing)).toBeUndefined()
    const known = folderMsg(
      typing,
      FolderSelect.Message.SucceededFetchFolders({ folders: ["manga"] }),
    )
    expect(startArgs(known)).toMatchObject({
      subfolder: Option.some("manga"),
      newFolder: Option.some(false),
    })
    const fresh = folderMsg(known, FolderSelect.Message.ChangedInput({ value: "fresh" }))
    expect(startArgs(fresh)).toMatchObject({
      subfolder: Option.some("fresh"),
      newFolder: Option.some(true),
    })
  })

  test("confirming closes the dialog and a second confirm is ignored", () => {
    const confirmed = AnnasArchive.update(
      open(withResults(["a"])),
      AnnasArchive.Message.ConfirmedDownload(),
    )
    expect(confirmed.model.isStartingDownload).toBe(true)
    expect(confirmed.commands?.map((c) => c.name)).toContain("CloseDialog")
    expect(
      AnnasArchive.update(confirmed.model, AnnasArchive.Message.ConfirmedDownload()).commands ?? [],
    ).toHaveLength(0)
  })

  test("success clears the selection and toasts; failure keeps it and toasts an error", () => {
    const starting = { ...withResults(["a"]), isStartingDownload: true }
    const ok = AnnasArchive.update(starting, AnnasArchive.Message.SucceededDownload({ started: 1 }))
    expect(ok.model.results.selected).toStrictEqual([])
    expect(ok.outMessage?._tag === "RequestedToast" && ok.outMessage.request).toMatchObject({
      title: "Started 1 download",
      maybeDescription: Option.some("Check the Jobs page for progress."),
    })
    const bad = AnnasArchive.update(
      starting,
      AnnasArchive.Message.FailedDownload({ reason: "down" }),
    )
    expect(bad.model.results.selected).toStrictEqual(["a"])
    expect(bad.model.isStartingDownload).toBe(false)
    expect(bad.outMessage?._tag === "RequestedToast" && bad.outMessage.request).toMatchObject({
      variant: "Error",
      title: "Failed to start downloads",
      maybeDescription: Option.some("down"),
    })
  })
})

describe("Commands (against a stubbed API)", () => {
  const run = <A>(
    program: Effect.Effect<A, never, ApiClientService>,
    respond: () => Response,
    seen: Array<HttpClientRequest.HttpClientRequest> = [],
  ) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        seen.push(request)
        return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
      }),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromise(program.pipe(Effect.provide(layer)))
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  test("search sends the query and decodes books (including null fields)", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      AnnasArchive.SearchAnnasArchive({ query: "dune" }).effect,
      json(200, [a, makeBook({ md5: "n", author: null, coverUrl: null })]),
      seen,
    )
    expect(seen[0]?.url).toContain("/api/annas-archive/search")
    expect(Array.from(seen[0]?.urlParams ?? [])).toContainEqual(["q", "dune"])
    expect(message._tag === "SucceededSearch" && message.results).toHaveLength(2)
  })

  test("search failure carries the query and message", async () => {
    const message = await run(
      AnnasArchive.SearchAnnasArchive({ query: "x" }).effect,
      json(502, { _tag: "AnnasArchiveHttpError", message: "upstream" }),
    )
    expect(message).toStrictEqual(
      AnnasArchive.Message.FailedSearch({ query: "x", reason: "upstream" }),
    )
  })

  test("download posts items and optional folder fields to the Anna's Archive endpoint", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      AnnasArchive.StartAnnasDownload({
        items: [a],
        subfolder: Option.some("books"),
        newFolder: Option.some(false),
      }).effect,
      json(200, { started: 1 }),
      seen,
    )
    expect(seen[0]?.url).toBe("http://api.test/api/annas-archive/download")
    expect(requestJson(seen[0])).toMatchObject({ subfolder: "books", newFolder: false })
    const plain: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      AnnasArchive.StartAnnasDownload({
        items: [a],
        subfolder: Option.none(),
        newFolder: Option.none(),
      }).effect,
      json(200, { started: 1 }),
      plain,
    )
    expect(requestJson(plain[0])).not.toHaveProperty("subfolder")
    expect(requestJson(plain[0])).not.toHaveProperty("newFolder")
    const failed = await run(
      AnnasArchive.StartAnnasDownload({
        items: [a],
        subfolder: Option.none(),
        newFolder: Option.none(),
      }).effect,
      json(502, { _tag: "CopypartyHttpError", message: "Copyparty unreachable" }),
    )
    expect(failed).toStrictEqual(
      AnnasArchive.Message.FailedDownload({ reason: "Copyparty unreachable" }),
    )
  })
})

const withPage = (page: AnnasArchive.Model) => ({
  ...modelAt(AppRoute.AnnasArchive()),
  annasArchive: page,
})

const openDialog = [
  click(role("button", { name: /^Download \d+ selected$/ })),
  Command.resolve(
    FolderSelect.FetchFolders,
    FolderSelect.Message.SucceededFetchFolders({ folders: ["books"] }),
  ),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

describe("view details", () => {
  test("the result count appears only once a search has finished", () => {
    scene({ update, view }, given(withPage(base)), sceneExpect(text("2 results")).toBeAbsent())
    scene(
      { update, view },
      given(
        withPage({
          ...withResults(),
          search: AnnasArchive.SearchState.Searching({ query: "dune" }),
        }),
      ),
      sceneExpect(text("2 results")).toBeAbsent(),
    )
    scene(
      { update, view },
      given(withPage(withResults())),
      sceneExpect(text("2 results")).toExist(),
    )
  })

  test("Download waits while a typed folder is still being checked", () => {
    const checking = AnnasArchive.update(
      open(withResults(["a"])),
      AnnasArchive.Message.GotFolderMessage({
        message: FolderSelect.Message.ChangedInput({ value: "books" }),
      }),
    ).model
    const checked = AnnasArchive.update(
      checking,
      AnnasArchive.Message.GotFolderMessage({
        message: FolderSelect.Message.SucceededFetchFolders({ folders: ["books"] }),
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
})

describe("view", () => {
  test("header, hint and search form", () => {
    scene(
      { update, view },
      given(withPage(base)),
      sceneExpect(text("I — ANNA'S ARCHIVE")).toExist(),
      sceneExpect(role("heading", { name: "Books" })).toExist(),
      sceneExpect(text("Search for a book to get started.")).toExist(),
      sceneExpect(selector(`#${AnnasArchive.SEARCH_INPUT_ID}`)).toHaveAttr(
        "placeholder",
        "Search for a book...",
      ),
      sceneExpect(role("button", { name: "Search" })).toBeDisabled(),
      type(label("Search for a book"), "dune"),
      sceneExpect(role("button", { name: "Search" })).toBeEnabled(),
    )
  })

  test("a search shows progress, then books and the count", () => {
    scene(
      { update, view },
      given(withPage({ ...base, queryInput: "dune" })),
      submit("form"),
      sceneExpect(role("button", { name: "Searching..." })).toBeDisabled(),
      Command.resolve(
        AnnasArchive.SearchAnnasArchive,
        AnnasArchive.Message.SucceededSearch({ query: "dune", results: [a, b] }),
      ),
      sceneExpect(text("2 results")).toExist(),
      sceneExpect(text("Dune")).toExist(),
    )
  })

  test("empty results and failures are explained", () => {
    scene(
      { update, view },
      given(withPage({ ...withResults(), results: Books.init() })),
      sceneExpect(text('No results for "dune".')).toExist(),
    )
    scene(
      { update, view },
      given(
        withPage({
          ...base,
          search: AnnasArchive.SearchState.Failed({ query: "x", reason: "down" }),
        }),
      ),
      sceneExpect(role("alert")).toContainText("down"),
    )
  })

  test("selecting shows the bar; the dialog is titled with the count and offers folders", () => {
    scene(
      { update, view },
      given(withPage(withResults(["a", "b"]))),
      ...openDialog,
      sceneExpect(role("dialog", { name: "Download 2 items" })).toExist(),
      sceneExpect(selector("datalist#download-folder-suggestions option[value='books']")).toExist(),
    )
  })

  test("confirming downloads, toasts on success and clears the bar", () => {
    scene(
      { update, view },
      given(withPage(withResults(["a"]))),
      ...openDialog,
      click(role("button", { name: "Download" })),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.AcquireResources),
      sceneExpect(role("button", { name: "Starting..." })).toBeDisabled(),
      Command.resolve(
        AnnasArchive.StartAnnasDownload,
        AnnasArchive.Message.SucceededDownload({ started: 1 }),
      ),
      sceneExpect(role("button", { name: /^Download \d+ selected$/ })).toBeAbsent(),
      sceneExpect(role("status")).toContainText("Started 1 download"),
      drainToast("toasts-entry-0"),
    )
  })
})

describe("wiring", () => {
  const coldLoad = (path: string) => {
    const url = Option.getOrThrow(parseUrl(`http://localhost${path}`))
    return init(url).commands?.map((c) => c.name) ?? []
  }

  test("navigating to /annas-archive from another page focuses the box once", () => {
    const from = modelAt(AppRoute.Watches())
    const url = Option.getOrThrow(parseUrl("http://localhost/annas-archive"))
    const entered = update(from, Message.ChangedUrl({ url }))
    expect(entered.commands?.map((c) => c.name)).toContain("FocusAnnasSearch")
    expect(
      update(entered.model, Message.ChangedUrl({ url })).commands?.map((c) => c.name) ?? [],
    ).not.toContain("FocusAnnasSearch")
  })

  test("a cold load on /annas-archive focuses the box; elsewhere it doesn't", () => {
    expect(coldLoad("/annas-archive")).toContain("FocusAnnasSearch")
    expect(coldLoad("/watches")).not.toContain("FocusAnnasSearch")
  })
})
