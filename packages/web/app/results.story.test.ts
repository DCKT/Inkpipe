import { Effect, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { AsyncData } from "foldkit"
import { Command, given, message, model, story } from "foldkit/story"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as Results from "./results"
import { makeResult, makeSeries } from "./resultsFixtures"

const a = makeResult({
  guid: "a",
  title: "Berserk v05 [Group]",
  magnetUrl: "magnet:a",
  downloadUrl: null,
})
const b = makeResult({
  guid: "b",
  title: "Vagabond v03",
  magnetUrl: null,
  downloadUrl: "http://t/b.torrent",
})
const withItems = (items = [a, b]) => Results.setItems(Results.init().model, items, 1_000)

describe("init and setItems", () => {
  test("init fetches the Komga series and starts empty", () => {
    const started = Results.init()
    expect(started.model.items).toStrictEqual([])
    expect(AsyncData.isLoading(started.model.series)).toBe(true)
    expect(started.commands?.map((c) => c.name)).toStrictEqual(["FetchSeries"])
  })

  test("new items clear the selection and save marks, and stamp the time", () => {
    const busy = {
      ...withItems(),
      selected: ["a"],
      saves: { a: Results.SaveState.Saved() },
    }
    const next = Results.setItems(busy, [b], 5_000)
    expect(next.items).toStrictEqual([b])
    expect(next.selected).toStrictEqual([])
    expect(next.saves).toStrictEqual({})
    expect(next.nowMillis).toBe(5_000)
  })

  test("matches are computed against whatever series are already known", () => {
    const known = Results.update(
      Results.init().model,
      Results.Message.SucceededFetchSeries({ series: [makeSeries()] }),
    ).model
    expect(Object.keys(Results.setItems(known, [a, b], 0).matches)).toStrictEqual(["a"])
  })
})

describe("selection", () => {
  test("toggling picks and unpicks, keeping pick order", () => {
    story(
      Results.update,
      given(withItems()),
      message(Results.Message.ToggledResult({ guid: "b" })),
      message(Results.Message.ToggledResult({ guid: "a" })),
      model((m) => {
        expect(m.selected).toStrictEqual(["b", "a"])
      }),
      message(Results.Message.ToggledResult({ guid: "b" })),
      model((m) => {
        expect(m.selected).toStrictEqual(["a"])
      }),
    )
  })

  test("a guid that isn't in the list is ignored", () => {
    const next = Results.update(withItems(), Results.Message.ToggledResult({ guid: "zzz" })).model
    expect(next.selected).toStrictEqual([])
  })

  test("select all picks everything, then clears, and a partial selection fills up", () => {
    const all = Results.update(withItems(), Results.Message.ToggledAll()).model
    expect(all.selected).toStrictEqual(["a", "b"])
    expect(Results.update(all, Results.Message.ToggledAll()).model.selected).toStrictEqual([])
    const partial = { ...withItems(), selected: ["a"] }
    expect(Results.update(partial, Results.Message.ToggledAll()).model.selected).toStrictEqual([
      "a",
      "b",
    ])
  })

  test("select all on an empty list stays empty", () => {
    expect(
      Results.update(Results.init().model, Results.Message.ToggledAll()).model.selected,
    ).toStrictEqual([])
  })

  test("clearSelection keeps the items", () => {
    const cleared = Results.clearSelection({ ...withItems(), selected: ["a", "b"] })
    expect(cleared.selected).toStrictEqual([])
    expect(cleared.items).toHaveLength(2)
  })
})

describe("save to AllDebrid", () => {
  test("sends that item's magnet and download URLs, once", () => {
    story(
      Results.update,
      given(withItems()),
      message(Results.Message.ClickedSaveToAllDebrid({ guid: "b" })),
      Command.expectHas(
        Results.SaveMagnet({
          guid: "b",
          listVersion: 1,
          magnetUrl: null,
          downloadUrl: "http://t/b.torrent",
        }),
      ),
      model((m) => {
        expect(m.saves["b"]?._tag).toBe("Saving")
      }),
      Command.resolve(
        Results.SaveMagnet,
        Results.Message.SucceededSaveMagnet({ guid: "b", listVersion: 1 }),
      ),
      model((m) => {
        expect(m.saves["b"]?._tag).toBe("Saved")
      }),
    )
  })

  test("a second click while saving does nothing", () => {
    const saving = Results.update(
      withItems(),
      Results.Message.ClickedSaveToAllDebrid({ guid: "a" }),
    )
    expect(
      Results.update(saving.model, Results.Message.ClickedSaveToAllDebrid({ guid: "a" }))
        .commands ?? [],
    ).toHaveLength(0)
  })

  test("a failed save can be retried", () => {
    const saving = Results.update(
      withItems(),
      Results.Message.ClickedSaveToAllDebrid({ guid: "a" }),
    ).model
    const failed = Results.update(
      saving,
      Results.Message.FailedSaveMagnet({ guid: "a", listVersion: 1, reason: "nope" }),
    ).model
    expect(failed.saves["a"]).toStrictEqual(Results.SaveState.Failed({ reason: "nope" }))
    const retried = Results.update(failed, Results.Message.ClickedSaveToAllDebrid({ guid: "a" }))
    expect(retried.commands?.map((c) => c.name)).toStrictEqual(["SaveMagnet"])
  })

  test("an unknown guid is ignored", () => {
    expect(
      Results.update(withItems(), Results.Message.ClickedSaveToAllDebrid({ guid: "zzz" }))
        .commands ?? [],
    ).toHaveLength(0)
  })

  test("saving one item doesn't touch another's mark", () => {
    const saving = Results.update(
      withItems(),
      Results.Message.ClickedSaveToAllDebrid({ guid: "a" }),
    ).model
    const next = Results.update(
      saving,
      Results.Message.SucceededSaveMagnet({ guid: "a", listVersion: 1 }),
    ).model
    expect(next.saves["a"]?._tag).toBe("Saved")
    expect(next.saves["b"]).toBeUndefined()
  })

  test("an answer about a save we never started is ignored", () => {
    const base = withItems()
    expect(
      Results.update(base, Results.Message.SucceededSaveMagnet({ guid: "a", listVersion: 1 }))
        .model,
    ).toStrictEqual(base)
    expect(
      Results.update(
        base,
        Results.Message.FailedSaveMagnet({ guid: "zzz", listVersion: 1, reason: "x" }),
      ).model,
    ).toStrictEqual(base)
  })

  test("an answer that arrives after the list was replaced is ignored", () => {
    const saving = Results.update(
      withItems(),
      Results.Message.ClickedSaveToAllDebrid({ guid: "a" }),
    ).model
    // a new search brings a list that also contains "a"…
    const replaced = Results.setItems(saving, [a, b], 2_000)
    // …then the old request answers.
    const late = Results.update(
      replaced,
      Results.Message.SucceededSaveMagnet({ guid: "a", listVersion: saving.listVersion }),
    ).model
    expect(late.saves["a"]).toBeUndefined()
    // and the new "a" can be saved again right away.
    expect(
      Results.update(replaced, Results.Message.ClickedSaveToAllDebrid({ guid: "a" })).commands?.map(
        (c) => c.name,
      ),
    ).toStrictEqual(["SaveMagnet"])
  })
})

describe("hostile guids and duplicates", () => {
  test.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "a release whose guid is %j behaves like any other",
    (guid) => {
      const odd = makeResult({ guid, title: "Odd one" })
      const base = Results.setItems(Results.init().model, [odd], 0)
      const saving = Results.update(base, Results.Message.ClickedSaveToAllDebrid({ guid }))
      expect(saving.commands?.map((c) => c.name)).toStrictEqual(["SaveMagnet"])
      expect(Results.lookup(saving.model.saves, guid)).toStrictEqual(
        Option.some(Results.SaveState.Saving()),
      )
      const saved = Results.update(
        saving.model,
        Results.Message.SucceededSaveMagnet({ guid, listVersion: saving.model.listVersion }),
      ).model
      expect(Results.lookup(saved.saves, guid)).toStrictEqual(
        Option.some(Results.SaveState.Saved()),
      )
    },
  )

  test("lookup ignores inherited members", () => {
    expect(Results.lookup({}, "toString")).toStrictEqual(Option.none())
    expect(Results.lookup({}, "constructor")).toStrictEqual(Option.none())
    expect(Results.lookup({ a: 1 }, "a")).toStrictEqual(Option.some(1))
  })

  test("the same release listed twice becomes one row, one selection, one download", () => {
    const dup = Results.setItems(Results.init().model, [a, b, a], 0)
    expect(dup.items.map((i) => i.guid)).toStrictEqual(["a", "b"])
    const picked = Results.update(dup, Results.Message.ToggledResult({ guid: "a" })).model
    expect(Results.selectedItems(picked)).toHaveLength(1)
  })

  test("every setItems starts a new list version", () => {
    const first = Results.setItems(Results.init().model, [a], 0)
    expect(Results.setItems(first, [a], 0).listVersion).toBe(first.listVersion + 1)
  })
})

describe("Komga series", () => {
  test("arriving series produce matches for the current items", () => {
    const next = Results.update(
      withItems(),
      Results.Message.SucceededFetchSeries({ series: [makeSeries()] }),
    ).model
    expect(next.matches["a"]?.seriesName).toBe("Berserk")
    expect(next.matches["b"]).toBeUndefined()
  })

  test("a failed fetch leaves the list without badges and without noise", () => {
    const next = Results.update(
      withItems(),
      Results.Message.FailedFetchSeries({ reason: "no komga" }),
    )
    expect(next.model.matches).toStrictEqual({})
    expect(AsyncData.isFailure(next.model.series)).toBe(true)
    expect(next.commands ?? []).toHaveLength(0)
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

  test("FetchSeries success and failure", async () => {
    expect(await run(Results.FetchSeries().effect, json(200, [makeSeries()]))).toStrictEqual(
      Results.Message.SucceededFetchSeries({ series: [makeSeries()] }),
    )
    const failed = await run(
      Results.FetchSeries().effect,
      json(503, { _tag: "KomgaNotConfigured", message: "no komga" }),
    )
    expect(failed).toStrictEqual(Results.Message.FailedFetchSeries({ reason: "no komga" }))
  })

  test("SaveMagnet posts the URLs and reports by guid", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const ok = await run(
      Results.SaveMagnet({ guid: "a", listVersion: 1, magnetUrl: "magnet:a", downloadUrl: null })
        .effect,
      json(200, { id: 7, ready: false }),
      seen,
    )
    expect(ok).toStrictEqual(Results.Message.SucceededSaveMagnet({ guid: "a", listVersion: 1 }))
    expect(seen[0]?.url).toBe("http://api.test/api/alldebrid/save-magnet")
    const body = seen[0]?.body
    expect(
      body && "body" in body
        ? JSON.parse(new TextDecoder().decode(body.body as Uint8Array))
        : undefined,
    ).toStrictEqual({
      magnetUrl: "magnet:a",
      downloadUrl: null,
    })

    const failed = await run(
      Results.SaveMagnet({ guid: "a", listVersion: 1, magnetUrl: null, downloadUrl: null }).effect,
      json(422, { _tag: "NoMagnetUrl", message: "No magnet URL" }),
    )
    expect(failed).toStrictEqual(
      Results.Message.FailedSaveMagnet({ guid: "a", listVersion: 1, reason: "No magnet URL" }),
    )
  })
})
