import { Effect, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { AsyncData } from "foldkit"
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
  text,
} from "foldkit/scene"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as Latest from "./latest"
import { AppRoute, update, view } from "./main"
import * as Results from "./results"
import { makeResult } from "./resultsFixtures"
import { requestJson } from "./testHttp"
import { drainToast, modelAt } from "./testing"

const a = makeResult({ guid: "a", title: "Berserk v05" })
const b = makeResult({ guid: "b", title: "Vagabond v03" })

const base = Latest.init()
const loaded = (selected: ReadonlyArray<string> = []): Latest.Model => {
  const results = Results.setItems(base.results, [a, b], 1_000)
  return { ...base, load: Latest.LoadState.Done(), results: { ...results, selected } }
}

describe("update", () => {
  test("entering loads the latest releases and the Komga series", () => {
    const entered = Latest.enter(base)
    expect(entered.model.load._tag).toBe("Loading")
    expect(AsyncData.isLoading(entered.model.results.series)).toBe(true)
    expect(entered.commands?.map((c) => c.name).sort()).toStrictEqual([
      "FetchLatest",
      "FetchSeries",
    ])
  })

  test("success shows the items and stamps the time", () => {
    const done = Latest.update(
      Latest.enter(base).model,
      Latest.Message.SucceededFetchLatest({ results: [a, b], nowMillis: 9 }),
    ).model
    expect(done.load._tag).toBe("Done")
    expect(done.results.items).toStrictEqual([a, b])
    expect(done.results.nowMillis).toBe(9)
  })

  test("failure shows the reason", () => {
    const failed = Latest.update(
      Latest.enter(base).model,
      Latest.Message.FailedFetchLatest({ reason: "no prowlarr" }),
    ).model
    expect(failed.load).toStrictEqual(Latest.LoadState.Failed({ reason: "no prowlarr" }))
  })

  test("refresh reloads and drops the selection, but not while already loading", () => {
    const refreshed = Latest.update(loaded(["a"]), Latest.Message.ClickedRefresh())
    expect(refreshed.commands?.map((c) => c.name)).toStrictEqual(["FetchLatest"])
    expect(refreshed.model.results.selected).toStrictEqual([])
    expect(
      Latest.update(refreshed.model, Latest.Message.ClickedRefresh()).commands ?? [],
    ).toHaveLength(0)
  })

  test("download sends the selected items in list order, once", () => {
    const started = Latest.update(loaded(["b", "a"]), Latest.Message.ClickedDownload())
    expect(started.model.isStartingDownload).toBe(true)
    expect(started.commands?.[0]?.args).toStrictEqual({ items: [a, b] })
    expect(
      Latest.update(started.model, Latest.Message.ClickedDownload()).commands ?? [],
    ).toHaveLength(0)
  })

  test("download with nothing selected does nothing", () => {
    expect(Latest.update(loaded(), Latest.Message.ClickedDownload()).commands ?? []).toHaveLength(0)
  })

  test("download success clears the selection and toasts; failure keeps it and toasts an error", () => {
    const starting = { ...loaded(["a"]), isStartingDownload: true }
    const ok = Latest.update(starting, Latest.Message.SucceededDownload({ started: 1 }))
    expect(ok.model.results.selected).toStrictEqual([])
    expect(ok.outMessage?._tag === "RequestedToast" && ok.outMessage.request.title).toBe(
      "Started 1 downloads",
    )
    const bad = Latest.update(starting, Latest.Message.FailedDownload({ reason: "down" }))
    expect(bad.model.results.selected).toStrictEqual(["a"])
    expect(bad.model.isStartingDownload).toBe(false)
    expect(bad.outMessage?._tag === "RequestedToast" && bad.outMessage.request).toMatchObject({
      variant: "Error",
      title: "Failed to start downloads",
      maybeDescription: Option.some("down"),
    })
  })
})

describe("one load at a time", () => {
  test("entering while a load runs reuses it instead of starting another", () => {
    const first = Latest.enter(base).model
    const again = Latest.enter(first)
    expect(again.commands?.map((c) => c.name) ?? []).not.toContain("FetchLatest")
    expect(again.model.load._tag).toBe("Loading")
  })

  test("entering while loading keeps a selection the user already made", () => {
    const loading = { ...loaded(["a"]), load: Latest.LoadState.Loading() }
    expect(Latest.enter(loading).model.results.selected).toStrictEqual(["a"])
  })

  test("an answer that arrives when nothing is loading is ignored", () => {
    const done = loaded(["a"])
    expect(
      Latest.update(done, Latest.Message.SucceededFetchLatest({ results: [], nowMillis: 5 })).model,
    ).toStrictEqual(done)
    expect(
      Latest.update(done, Latest.Message.FailedFetchLatest({ reason: "late" })).model,
    ).toStrictEqual(done)
  })

  test("the answer to the running load is applied", () => {
    const loading = Latest.enter(base).model
    expect(
      Latest.update(loading, Latest.Message.SucceededFetchLatest({ results: [a], nowMillis: 5 }))
        .model.load._tag,
    ).toBe("Done")
    expect(
      Latest.update(loading, Latest.Message.FailedFetchLatest({ reason: "x" })).model.load._tag,
    ).toBe("Failed")
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

  test("FetchLatest success and failure", async () => {
    const ok = await run(Latest.FetchLatest().effect, json(200, [a]))
    expect(ok._tag === "SucceededFetchLatest" && ok.results).toStrictEqual([a])
    const failed = await run(
      Latest.FetchLatest().effect,
      json(503, { _tag: "ProwlarrNotConfigured", message: "Prowlarr is not configured" }),
    )
    expect(failed).toStrictEqual(
      Latest.Message.FailedFetchLatest({ reason: "Prowlarr is not configured" }),
    )
  })

  test("download posts only the items (no folder)", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Latest.StartDownload({ items: [a] }).effect,
      json(200, { started: 1 }),
      seen,
    )
    expect(message).toStrictEqual(Latest.Message.SucceededDownload({ started: 1 }))
    const sent = requestJson(seen[0])
    expect(sent).toHaveProperty("items")
    expect(sent).not.toHaveProperty("subfolder")
    expect(sent).not.toHaveProperty("newFolder")
    const failed = await run(
      Latest.StartDownload({ items: [a] }).effect,
      json(502, { _tag: "CopypartyHttpError", message: "Copyparty unreachable" }),
    )
    expect(failed).toStrictEqual(Latest.Message.FailedDownload({ reason: "Copyparty unreachable" }))
  })
})

const withPage = (page: Latest.Model) => ({ ...modelAt(AppRoute.Latest()), latest: page })

describe("view", () => {
  test("header, count and refresh button", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(text("II — LATEST")).toExist(),
      sceneExpect(role("heading", { name: "Latest Mangas" })).toExist(),
      sceneExpect(text("2 results")).toExist(),
      sceneExpect(role("button", { name: "Refresh" })).toBeEnabled(),
    )
  })

  test("no empty-state message when there are results", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(text("No recent releases found.")).toBeAbsent(),
    )
  })

  test("while the first load runs there is a loading message and no result count", () => {
    scene(
      { update, view },
      given(withPage({ ...base, load: Latest.LoadState.Loading() })),
      sceneExpect(text("Loading latest releases…")).toExist(),
      sceneExpect(text("0 results")).toBeAbsent(),
    )
  })

  test("a refresh over existing results hides the count but keeps the list", () => {
    scene(
      { update, view },
      given(withPage({ ...loaded(), load: Latest.LoadState.Loading() })),
      sceneExpect(text("2 results")).toBeAbsent(),
      sceneExpect(text("Loading latest releases…")).toBeAbsent(),
      sceneExpect(text("Berserk v05")).toExist(),
    )
  })

  test("refreshing locks the button", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(role("button", { name: "Refresh" })),
      sceneExpect(role("button", { name: "Refreshing..." })).toBeDisabled(),
      Command.resolve(
        Latest.FetchLatest,
        Latest.Message.SucceededFetchLatest({ results: [], nowMillis: 0 }),
      ),
      sceneExpect(text("No recent releases found.")).toExist(),
    )
  })

  test("an error is shown as an alert", () => {
    scene(
      { update, view },
      given(withPage({ ...base, load: Latest.LoadState.Failed({ reason: "no prowlarr" }) })),
      sceneExpect(role("alert")).toContainText("no prowlarr"),
    )
  })

  test("selecting shows the download bar, and downloading toasts on success", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(selector("#latest-row-0")),
      sceneExpect(role("button", { name: "Download 1 selected" })).toExist(),
      click(role("button", { name: "Download 1 selected" })),
      sceneExpect(role("button", { name: "Starting..." })).toBeDisabled(),
      Command.resolve(Latest.StartDownload, Latest.Message.SucceededDownload({ started: 1 })),
      sceneExpect(role("status")).toContainText("Started 1 downloads"),
      drainToast("toasts-entry-0"),
    )
  })
})
