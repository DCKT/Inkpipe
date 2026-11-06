import { Dialog } from "@foldkit/ui"
import { Effect, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { AsyncData } from "foldkit"
import { Command, given, message, model, story } from "foldkit/story"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as FolderSelect from "./folderSelect"
import * as Prowlarr from "./prowlarr"
import * as Results from "./results"
import { makeResult } from "./resultsFixtures"
import { requestJson } from "./testHttp"

const a = makeResult({ guid: "a", title: "Berserk v05" })
const b = makeResult({ guid: "b", title: "Vagabond v03" })

const base = Prowlarr.init()

/** A page that has searched for "berserk" and shows `a` and `b`. */
const withResults = (items = [a, b]): Prowlarr.Model => ({
  ...base,
  queryInput: "berserk",
  search: Prowlarr.SearchState.Done({ query: "berserk" }),
  results: Results.setItems(Results.init(), items, 1_000),
})

const withSelection = (guids: ReadonlyArray<string>): Prowlarr.Model => {
  const page = withResults()
  return { ...page, results: { ...page.results, selected: guids } }
}

describe("enter", () => {
  test("starts loading Komga series and focuses the search box", () => {
    const entered = Prowlarr.enter(base)
    expect(AsyncData.isLoading(entered.model.results.series)).toBe(true)
    expect(entered.commands?.map((c) => c.name).sort()).toStrictEqual([
      "FetchSeries",
      "FocusSearch",
    ])
  })

  test("coming back keeps loaded series and just refocuses", () => {
    const loaded = {
      ...base,
      results: Results.update(base.results, Results.Message.SucceededFetchSeries({ series: [] }))
        .model,
    }
    expect(Prowlarr.enter(loaded).commands?.map((c) => c.name)).toStrictEqual(["FocusSearch"])
  })
})

describe("searching", () => {
  test("typing changes only the input", () => {
    const next = Prowlarr.update(base, Prowlarr.Message.ChangedQuery({ value: "bers" })).model
    expect(next.queryInput).toBe("bers")
    expect(next.search._tag).toBe("Idle")
  })

  test("submitting searches for the trimmed text", () => {
    story(
      Prowlarr.update,
      given({ ...base, queryInput: "  berserk  " }),
      message(Prowlarr.Message.SubmittedSearch()),
      Command.expectHas(Prowlarr.SearchProwlarr({ query: "berserk" })),
      model((m) => {
        expect(m.search).toStrictEqual(Prowlarr.SearchState.Searching({ query: "berserk" }))
      }),
      Command.resolve(
        Prowlarr.SearchProwlarr,
        Prowlarr.Message.SucceededSearch({ query: "berserk", results: [a], nowMillis: 5 }),
      ),
      model((m) => {
        expect(m.search).toStrictEqual(Prowlarr.SearchState.Done({ query: "berserk" }))
        expect(m.results.items).toStrictEqual([a])
        expect(m.results.nowMillis).toBe(5)
      }),
    )
  })

  test("empty or blank input does not search", () => {
    for (const queryInput of ["", "   "]) {
      const result = Prowlarr.update({ ...base, queryInput }, Prowlarr.Message.SubmittedSearch())
      expect(result.commands ?? []).toHaveLength(0)
      expect(result.model.search._tag).toBe("Idle")
    }
  })

  test("a second submit while searching does nothing", () => {
    const searching = Prowlarr.update(
      { ...base, queryInput: "x" },
      Prowlarr.Message.SubmittedSearch(),
    ).model
    expect(
      Prowlarr.update(searching, Prowlarr.Message.SubmittedSearch()).commands ?? [],
    ).toHaveLength(0)
  })

  test("a new search drops the previous selection", () => {
    const page = { ...withSelection(["a"]), queryInput: "again" }
    expect(
      Prowlarr.update(page, Prowlarr.Message.SubmittedSearch()).model.results.selected,
    ).toStrictEqual([])
  })

  test("an answer to an older search is ignored", () => {
    const searching = Prowlarr.update(
      { ...base, queryInput: "new" },
      Prowlarr.Message.SubmittedSearch(),
    ).model
    const stale = Prowlarr.update(
      searching,
      Prowlarr.Message.SucceededSearch({ query: "old", results: [a], nowMillis: 1 }),
    ).model
    expect(stale).toStrictEqual(searching)
    const staleFailure = Prowlarr.update(
      searching,
      Prowlarr.Message.FailedSearch({ query: "old", reason: "x" }),
    ).model
    expect(staleFailure).toStrictEqual(searching)
  })

  test("a failed search shows the reason and empties the list", () => {
    const failed = Prowlarr.update(
      { ...withResults(), search: Prowlarr.SearchState.Searching({ query: "boom" }) },
      Prowlarr.Message.FailedSearch({ query: "boom", reason: "Prowlarr is not configured" }),
    ).model
    expect(failed.search).toStrictEqual(
      Prowlarr.SearchState.Failed({ query: "boom", reason: "Prowlarr is not configured" }),
    )
    expect(failed.results.items).toStrictEqual([])
  })
})

describe("downloading", () => {
  test("is ignored with nothing selected", () => {
    const result = Prowlarr.update(withResults(), Prowlarr.Message.ClickedDownload())
    expect(result.model.downloadDialog.isOpen).toBe(false)
    expect(result.commands ?? []).toHaveLength(0)
  })

  test("opening refreshes the folder list and shows the dialog", () => {
    story(
      Prowlarr.update,
      given(withSelection(["a"])),
      message(Prowlarr.Message.ClickedDownload()),
      Command.expectHas(FolderSelect.FetchFolders()),
      Command.resolve(
        FolderSelect.FetchFolders,
        FolderSelect.Message.SucceededFetchFolders({ folders: ["manga"] }),
      ),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      model((m) => {
        expect(m.downloadDialog.isOpen).toBe(true)
      }),
    )
  })

  test("a second click while the dialog is open does nothing", () => {
    const opened = Prowlarr.update(withSelection(["a"]), Prowlarr.Message.ClickedDownload()).model
    expect(Prowlarr.update(opened, Prowlarr.Message.ClickedDownload()).commands ?? []).toHaveLength(
      0,
    )
  })

  test("confirming with no folder downloads the selected items to the default place", () => {
    const opened = Prowlarr.update(
      withSelection(["b", "a"]),
      Prowlarr.Message.ClickedDownload(),
    ).model
    const confirmed = Prowlarr.update(opened, Prowlarr.Message.ConfirmedDownload())
    expect(confirmed.model.isStartingDownload).toBe(true)
    const start = confirmed.commands?.find((c) => c.name === "StartDownload")
    expect(start?.args).toStrictEqual({
      // list order, not pick order
      items: [a, b],
      subfolder: Option.none(),
      newFolder: Option.none(),
    })
  })

  test("a chosen existing folder is sent encoded and not as new", () => {
    const opened = Prowlarr.update(withSelection(["a"]), Prowlarr.Message.ClickedDownload()).model
    const folders = Prowlarr.update(
      opened,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.SucceededFetchFolders({ folders: ["My%20Manga"] }),
      }),
    ).model
    const typed = Prowlarr.update(
      folders,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.ChangedInput({ value: "my manga" }),
      }),
    ).model
    const start = Prowlarr.update(typed, Prowlarr.Message.ConfirmedDownload()).commands?.find(
      (c) => c.name === "StartDownload",
    )
    expect(start?.args).toMatchObject({
      subfolder: Option.some("My%20Manga"),
      newFolder: Option.some(false),
    })
  })

  test("a typed new folder is sent trimmed and flagged new", () => {
    const opened = Prowlarr.update(withSelection(["a"]), Prowlarr.Message.ClickedDownload()).model
    const loaded = Prowlarr.update(
      opened,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.SucceededFetchFolders({ folders: [] }),
      }),
    ).model
    const typed = Prowlarr.update(
      loaded,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.ChangedInput({ value: " fresh " }),
      }),
    ).model
    const start = Prowlarr.update(typed, Prowlarr.Message.ConfirmedDownload()).commands?.find(
      (c) => c.name === "StartDownload",
    )
    expect(start?.args).toMatchObject({
      subfolder: Option.some("fresh"),
      newFolder: Option.some(true),
    })
  })

  test("confirming closes the dialog, and a second confirm is ignored", () => {
    const opened = Prowlarr.update(withSelection(["a"]), Prowlarr.Message.ClickedDownload()).model
    const confirmed = Prowlarr.update(opened, Prowlarr.Message.ConfirmedDownload())
    expect(confirmed.commands?.map((c) => c.name)).toContain("CloseDialog")
    expect(
      Prowlarr.update(confirmed.model, Prowlarr.Message.ConfirmedDownload()).commands ?? [],
    ).toHaveLength(0)
  })

  test("success clears the selection and asks for a toast", () => {
    const starting = { ...withSelection(["a", "b"]), isStartingDownload: true }
    const done = Prowlarr.update(starting, Prowlarr.Message.SucceededDownload({ started: 2 }))
    expect(done.model.isStartingDownload).toBe(false)
    expect(done.model.results.selected).toStrictEqual([])
    expect(done.outMessage?._tag).toBe("RequestedToast")
    expect(done.outMessage?._tag === "RequestedToast" && done.outMessage.request.title).toBe(
      "Started 2 downloads",
    )
  })

  test("failure keeps the selection so the user can retry, and toasts the error", () => {
    const starting = { ...withSelection(["a"]), isStartingDownload: true }
    const failed = Prowlarr.update(
      starting,
      Prowlarr.Message.FailedDownload({ reason: "Copyparty down" }),
    )
    expect(failed.model.isStartingDownload).toBe(false)
    expect(failed.model.results.selected).toStrictEqual(["a"])
    expect(failed.outMessage?._tag === "RequestedToast" && failed.outMessage.request.variant).toBe(
      "Error",
    )
  })
})

describe("folder safety", () => {
  const openWith = (page: Prowlarr.Model): Prowlarr.Model =>
    Prowlarr.update(page, Prowlarr.Message.ClickedDownload()).model

  const typeFolder = (page: Prowlarr.Model, value: string): Prowlarr.Model =>
    Prowlarr.update(
      page,
      Prowlarr.Message.GotFolderMessage({ message: FolderSelect.Message.ChangedInput({ value }) }),
    ).model

  const loadFolders = (page: Prowlarr.Model, folders: ReadonlyArray<string>): Prowlarr.Model =>
    Prowlarr.update(
      page,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.SucceededFetchFolders({ folders }),
      }),
    ).model

  const startArgs = (page: Prowlarr.Model) =>
    Prowlarr.update(page, Prowlarr.Message.ConfirmedDownload()).commands?.find(
      (c) => c.name === "StartDownload",
    )?.args

  test("a fresh dialog never remembers the previous folder", () => {
    const first = typeFolder(loadFolders(openWith(withSelection(["a"])), []), "fresh")
    const closed = { ...first, downloadDialog: { ...first.downloadDialog, isOpen: false } }
    expect(openWith(closed).folder.input).toBe("")
  })

  test("with a folder typed, Download waits until the existing folders are known", () => {
    const opened = openWith(withSelection(["a"]))
    const typed = typeFolder(opened, "manga")
    expect(Prowlarr.isFolderUnsettled(typed)).toBe(true)
    expect(startArgs(typed)).toBeUndefined()
    const known = loadFolders(typed, ["manga"])
    expect(Prowlarr.isFolderUnsettled(known)).toBe(false)
    expect(startArgs(known)).toMatchObject({
      subfolder: Option.some("manga"),
      newFolder: Option.some(false),
    })
  })

  test("no folder typed: Download is allowed even while the list loads", () => {
    const opened = openWith(withSelection(["a"]))
    expect(Prowlarr.isFolderUnsettled(opened)).toBe(false)
    expect(startArgs(opened)).toMatchObject({ subfolder: Option.none(), newFolder: Option.none() })
  })

  test("if the folder list could not be loaded, the folder is sent with no 'new' claim", () => {
    const opened = openWith(withSelection(["a"]))
    const failed = Prowlarr.update(
      opened,
      Prowlarr.Message.GotFolderMessage({
        message: FolderSelect.Message.FailedFetchFolders({ reason: "x" }),
      }),
    ).model
    const typed = typeFolder(failed, "Manga")
    expect(startArgs(typed)).toMatchObject({
      subfolder: Option.some("Manga"),
      newFolder: Option.none(),
    })
  })
})

describe("searching clears the old list", () => {
  test("submitting empties the results so nothing stale can be selected", () => {
    const page = { ...withSelection(["a"]), queryInput: "again" }
    const searching = Prowlarr.update(page, Prowlarr.Message.SubmittedSearch()).model
    expect(searching.results.items).toStrictEqual([])
    expect(searching.results.selected).toStrictEqual([])
  })
})

describe("guards and wording", () => {
  test("confirming with nothing selected does nothing", () => {
    expect(
      Prowlarr.update(withResults(), Prowlarr.Message.ConfirmedDownload()).commands ?? [],
    ).toHaveLength(0)
  })

  test("the success toast says what started and where to look", () => {
    const done = Prowlarr.update(
      withSelection(["a"]),
      Prowlarr.Message.SucceededDownload({ started: 3 }),
    )
    expect(done.outMessage?._tag === "RequestedToast" && done.outMessage.request).toMatchObject({
      title: "Started 3 downloads",
      maybeDescription: Option.some("Check the Jobs page for progress."),
    })
  })

  test("the search box id is the one the focus Command targets", () => {
    expect(Prowlarr.SEARCH_INPUT_ID).toBe("prowlarr-search")
  })
})

describe("Commands (against a stubbed API)", () => {
  const run = <A>(
    program: Effect.Effect<A, never, ApiClientService>,
    respond: (request: HttpClientRequest.HttpClientRequest) => Response,
    seen: Array<HttpClientRequest.HttpClientRequest> = [],
  ) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        seen.push(request)
        return Effect.succeed(HttpClientResponse.fromWeb(request, respond(request)))
      }),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromise(program.pipe(Effect.provide(layer)))
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  test("search sends the query and stamps the time", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Prowlarr.SearchProwlarr({ query: "berserk" }).effect,
      json(200, [a]),
      seen,
    )
    expect(seen[0]?.url).toContain("/api/search")
    expect(Array.from(seen[0]?.urlParams ?? [])).toContainEqual(["q", "berserk"])
    expect(message._tag).toBe("SucceededSearch")
    expect(message._tag === "SucceededSearch" && message.nowMillis > 0).toBe(true)
  })

  test("a search failure carries the query and the server's message", async () => {
    const message = await run(
      Prowlarr.SearchProwlarr({ query: "x" }).effect,
      json(503, { _tag: "ProwlarrNotConfigured", message: "Prowlarr is not configured" }),
    )
    expect(message).toStrictEqual(
      Prowlarr.Message.FailedSearch({ query: "x", reason: "Prowlarr is not configured" }),
    )
  })

  test("download posts the items and folder, and reports how many started", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Prowlarr.StartDownload({
        items: [a],
        subfolder: Option.some("manga"),
        newFolder: Option.some(true),
      }).effect,
      json(200, { started: 1 }),
      seen,
    )
    expect(message).toStrictEqual(Prowlarr.Message.SucceededDownload({ started: 1 }))
    expect(requestJson(seen[0])).toMatchObject({ subfolder: "manga", newFolder: true })
  })

  test("an existing folder is sent with newFolder false, not just omitted or true", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      Prowlarr.StartDownload({
        items: [a],
        subfolder: Option.some("manga"),
        newFolder: Option.some(false),
      }).effect,
      json(200, { started: 1 }),
      seen,
    )
    expect(requestJson(seen[0])).toMatchObject({ subfolder: "manga", newFolder: false })
  })

  test("a folder can be sent without any newFolder claim", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      Prowlarr.StartDownload({
        items: [a],
        subfolder: Option.some("manga"),
        newFolder: Option.none(),
      }).effect,
      json(200, { started: 1 }),
      seen,
    )
    const sent = requestJson(seen[0])
    expect(sent).toMatchObject({ subfolder: "manga" })
    expect(sent).not.toHaveProperty("newFolder")
  })

  test("download without a folder sends neither field", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      Prowlarr.StartDownload({ items: [a], subfolder: Option.none(), newFolder: Option.none() })
        .effect,
      json(200, { started: 1 }),
      seen,
    )
    const sent = requestJson(seen[0])
    expect(sent).not.toHaveProperty("subfolder")
    expect(sent).not.toHaveProperty("newFolder")
    expect(sent).toHaveProperty("items")
  })

  test("download failure carries the server's message", async () => {
    const message = await run(
      Prowlarr.StartDownload({ items: [a], subfolder: Option.none(), newFolder: Option.none() })
        .effect,
      json(502, { _tag: "CopypartyHttpError", message: "Copyparty unreachable" }),
    )
    expect(message).toStrictEqual(
      Prowlarr.Message.FailedDownload({ reason: "Copyparty unreachable" }),
    )
  })
})
