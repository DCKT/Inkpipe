import { Dialog } from "@foldkit/ui"
import { Effect, Fiber, Layer, Option, Stream } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { AsyncData } from "foldkit"
import {
  Command,
  Mount,
  all,
  click,
  expect as sceneExpect,
  expectAll,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
} from "foldkit/scene"
import { fromString as parseUrl } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as Komga from "./komga"
import { makeBook, makeSeries } from "./komgaFixtures"
import { AppRoute, Message, init, update, view } from "./main"
import { modelAt } from "./testing"

const configured = { url: "https://komga.test", apiKey: "k", defaultLibraryId: "L1" }
const berserk = makeSeries() // name "dir-berserk-folder", title "Berserk"
const vagabond = makeSeries({
  id: "s2",
  name: "vagabond",
  metadata: { status: "ENDED", title: "" },
  booksCount: 1,
})

/** A page that has loaded config, libraries (L1, L2) and both series, on library L1. */
const loaded = (): Komga.Model => {
  let m = Komga.enter(Komga.init()).model
  m = Komga.update(m, Komga.Message.SucceededFetchConfig({ komga: configured })).model
  m = Komga.update(
    m,
    Komga.Message.SucceededFetchLibraries({
      libraries: [
        { id: "L1", name: "Manga" },
        { id: "L2", name: "Novels" },
      ],
    }),
  ).model
  return Komga.update(
    m,
    Komga.Message.SucceededFetchSeries({ libraryId: "L1", series: [berserk, vagabond] }),
  ).model
}

describe("pure helpers", () => {
  test("displayTitle falls back to the series name", () => {
    expect(Komga.displayTitle(berserk)).toBe("Berserk")
    expect(Komga.displayTitle(vagabond)).toBe("vagabond")
  })

  test("hasCredentials needs both url and key", () => {
    expect(Komga.hasCredentials({ url: "u", apiKey: "k" })).toBe(true)
    expect(Komga.hasCredentials({ url: "", apiKey: "k" })).toBe(false)
    expect(Komga.hasCredentials({ url: "u", apiKey: "" })).toBe(false)
  })

  test("filterSeries matches the displayed title, ignoring case and outer spaces", () => {
    expect(Komga.filterSeries([berserk, vagabond], "  BERS ")).toStrictEqual([berserk])
    expect(Komga.filterSeries([berserk, vagabond], "VAGA")).toStrictEqual([vagabond])
    expect(Komga.filterSeries([berserk, vagabond], "")).toStrictEqual([berserk, vagabond])
    expect(Komga.filterSeries([berserk, vagabond], "zzz")).toStrictEqual([])
    // the folder name is not what's shown, so it isn't what's searched
    expect(Komga.filterSeries([berserk, vagabond], "folder")).toStrictEqual([])
  })

  test("booksLabel pluralises", () => {
    expect(Komga.booksLabel(1)).toBe("1 book")
    expect(Komga.booksLabel(0)).toBe("0 books")
    expect(Komga.booksLabel(41)).toBe("41 books")
  })

  test("formatDate formats valid dates and returns garbage as it came", () => {
    const formatted = Komga.formatDate("2026-01-15T10:00:00Z")
    expect(formatted).toContain("2026")
    expect(formatted).toMatch(/Jan|janv/i)
    expect(Komga.formatDate("not a date")).toBe("not a date")
  })

  test("statusClass knows the four statuses and defaults to ENDED's look", () => {
    expect(Komga.statusClass("ONGOING")).toContain("emerald")
    expect(Komga.statusClass("HIATUS")).toContain("amber")
    expect(Komga.statusClass("ABANDONED")).toContain("red")
    expect(Komga.statusClass("ENDED")).toBe(Komga.statusClass("SOMETHING_ELSE"))
    expect(Komga.statusClass("constructor")).toBe(Komga.statusClass("ENDED"))
  })
})

describe("loading", () => {
  test("entering checks the saved settings", () => {
    const entered = Komga.enter(Komga.init())
    expect(AsyncData.isLoading(entered.model.config)).toBe(true)
    expect(entered.commands?.map((c) => c.name)).toStrictEqual(["FetchKomgaConfig"])
  })

  test("without credentials, the user is sent to Settings and nothing else loads", () => {
    const result = Komga.update(
      Komga.enter(Komga.init()).model,
      Komga.Message.SucceededFetchConfig({ komga: { url: "", apiKey: "", defaultLibraryId: "" } }),
    )
    expect(result.outMessage).toStrictEqual(Komga.OutMessage.RequestedSettings())
    expect(result.commands ?? []).toHaveLength(0)
  })

  test("with credentials it adopts the saved default library and loads libraries and series", () => {
    const result = Komga.update(
      Komga.enter(Komga.init()).model,
      Komga.Message.SucceededFetchConfig({ komga: configured }),
    )
    expect(result.model.selectedLibraryId).toStrictEqual(Option.some("L1"))
    expect(result.commands?.map((c) => c.name).sort()).toStrictEqual([
      "FetchKomgaLibraries",
      "FetchKomgaSeries",
    ])
    expect(result.commands?.find((c) => c.name === "FetchKomgaSeries")?.args).toStrictEqual({
      libraryId: "L1",
    })
  })

  test("an empty default means all libraries", () => {
    const result = Komga.update(
      Komga.enter(Komga.init()).model,
      Komga.Message.SucceededFetchConfig({ komga: { ...configured, defaultLibraryId: "" } }),
    )
    expect(result.model.selectedLibraryId).toStrictEqual(Option.some(""))
    expect(result.commands?.find((c) => c.name === "FetchKomgaSeries")?.args).toStrictEqual({
      libraryId: "",
    })
  })

  test("coming back keeps the library the user picked", () => {
    const picked = Komga.update(loaded(), Komga.Message.ChangedLibrary({ libraryId: "L2" })).model
    const again = Komga.update(
      Komga.enter(picked).model,
      Komga.Message.SucceededFetchConfig({ komga: configured }),
    )
    expect(again.model.selectedLibraryId).toStrictEqual(Option.some("L2"))
    expect(again.commands?.find((c) => c.name === "FetchKomgaSeries")?.args).toStrictEqual({
      libraryId: "L2",
    })
  })

  test("a failed settings load is recorded", () => {
    const failed = Komga.update(
      Komga.init(),
      Komga.Message.FailedFetchConfig({ reason: "x" }),
    ).model
    expect(AsyncData.isFailure(failed.config)).toBe(true)
  })

  test("a failed first library load is a failure; a failed refresh keeps the chips as stale", () => {
    const first = Komga.update(
      Komga.update(
        Komga.enter(Komga.init()).model,
        Komga.Message.SucceededFetchConfig({ komga: configured }),
      ).model,
      Komga.Message.FailedFetchLibraries({ reason: "x" }),
    ).model
    expect(AsyncData.isFailure(first.libraries)).toBe(true)

    const refresh = Komga.update(
      Komga.update(
        Komga.enter(loaded()).model,
        Komga.Message.SucceededFetchConfig({ komga: configured }),
      ).model,
      Komga.Message.FailedFetchLibraries({ reason: "x" }),
    ).model
    expect(AsyncData.isStale(refresh.libraries)).toBe(true)
    expect(AsyncData.getData(refresh.libraries)).toStrictEqual(
      Option.some([
        { id: "L1", name: "Manga" },
        { id: "L2", name: "Novels" },
      ]),
    )
    // and the shelf is untouched
    expect(AsyncData.hasData(refresh.series)).toBe(true)
  })

  test("Refresh after a settings failure retries the settings", () => {
    const failed = Komga.update(
      Komga.init(),
      Komga.Message.FailedFetchConfig({ reason: "x" }),
    ).model
    const retried = Komga.update(failed, Komga.Message.ClickedRefresh())
    expect(retried.commands?.map((c) => c.name)).toStrictEqual(["FetchKomgaConfig"])
    expect(AsyncData.isFailure(retried.model.config)).toBe(false)
  })

  test("Refresh does nothing before a library is chosen", () => {
    expect(
      Komga.update(Komga.enter(Komga.init()).model, Komga.Message.ClickedRefresh()).commands ?? [],
    ).toHaveLength(0)
  })
})

describe("libraries and series", () => {
  test("choosing another library clears the shelf and loads it", () => {
    const result = Komga.update(loaded(), Komga.Message.ChangedLibrary({ libraryId: "L2" }))
    expect(result.model.selectedLibraryId).toStrictEqual(Option.some("L2"))
    expect(AsyncData.hasData(result.model.series)).toBe(false)
    expect(result.commands?.[0]?.args).toStrictEqual({ libraryId: "L2" })
  })

  test("choosing the library you're on does nothing", () => {
    expect(
      Komga.update(loaded(), Komga.Message.ChangedLibrary({ libraryId: "L1" })).commands ?? [],
    ).toHaveLength(0)
  })

  test("an answer for a library you've left is ignored", () => {
    const onL2 = Komga.update(loaded(), Komga.Message.ChangedLibrary({ libraryId: "L2" })).model
    const late = Komga.update(
      onL2,
      Komga.Message.SucceededFetchSeries({ libraryId: "L1", series: [berserk] }),
    ).model
    expect(late).toStrictEqual(onL2)
    expect(
      Komga.update(onL2, Komga.Message.FailedFetchSeries({ libraryId: "L1", reason: "x" })).model,
    ).toStrictEqual(onL2)
  })

  test("refresh keeps the shelf visible while reloading, and is single-flight", () => {
    const refreshing = Komga.update(loaded(), Komga.Message.ClickedRefresh())
    expect(AsyncData.isRefreshing(refreshing.model.series)).toBe(true)
    expect(AsyncData.hasData(refreshing.model.series)).toBe(true)
    expect(refreshing.commands?.[0]?.args).toStrictEqual({ libraryId: "L1" })
    expect(
      Komga.update(refreshing.model, Komga.Message.ClickedRefresh()).commands ?? [],
    ).toHaveLength(0)
  })

  test("a failed refresh keeps the shelf and flags it stale", () => {
    const stale = Komga.update(
      Komga.update(loaded(), Komga.Message.ClickedRefresh()).model,
      Komga.Message.FailedFetchSeries({ libraryId: "L1", reason: "komga down" }),
    ).model
    expect(AsyncData.isStale(stale.series)).toBe(true)
    expect(AsyncData.getData(stale.series)).toStrictEqual(Option.some([berserk, vagabond]))
  })

  test("the filter text is stored", () => {
    expect(Komga.update(loaded(), Komga.Message.ChangedFilter({ value: "ber" })).model.filter).toBe(
      "ber",
    )
  })
})

describe("thumbnails", () => {
  test("a card becoming visible fetches its thumbnail once", () => {
    const first = Komga.update(loaded(), Komga.Message.BecameVisible({ seriesId: "s1" }))
    expect(first.commands?.[0]?.args).toStrictEqual({ seriesId: "s1" })
    expect(
      Komga.update(first.model, Komga.Message.BecameVisible({ seriesId: "s1" })).commands ?? [],
    ).toHaveLength(0)
  })

  test("loaded and failed thumbnails are remembered per series", () => {
    let m = Komga.update(loaded(), Komga.Message.BecameVisible({ seriesId: "s1" })).model
    m = Komga.update(
      m,
      Komga.Message.SucceededFetchThumbnail({ seriesId: "s1", url: "data:image/png;base64,AA" }),
    ).model
    m = Komga.update(m, Komga.Message.BecameVisible({ seriesId: "s2" })).model
    m = Komga.update(m, Komga.Message.FailedFetchThumbnail({ seriesId: "s2" })).model
    expect(m.thumbnails["s1"]).toStrictEqual(
      Komga.Thumbnail.Loaded({ url: "data:image/png;base64,AA" }),
    )
    expect(m.thumbnails["s2"]).toStrictEqual(Komga.Thumbnail.Failed())
  })

  test("a series whose id is an Object.prototype name still works", () => {
    const m = Komga.update(loaded(), Komga.Message.BecameVisible({ seriesId: "constructor" }))
    expect(m.commands?.[0]?.args).toStrictEqual({ seriesId: "constructor" })
  })
})

describe("books dialog", () => {
  test("clicking a series opens the dialog and fetches its books", () => {
    const result = Komga.update(loaded(), Komga.Message.ClickedSeries({ seriesId: "s1" }))
    expect(result.model.booksDialog.isOpen).toBe(true)
    expect(Option.map(result.model.openSeries, (s) => s.id)).toStrictEqual(Option.some("s1"))
    expect(AsyncData.isLoading(result.model.books)).toBe(true)
    expect(result.commands?.find((c) => c.name === "FetchKomgaBooks")?.args).toStrictEqual({
      seriesId: "s1",
    })
  })

  test("an unknown series does nothing", () => {
    expect(
      Komga.update(loaded(), Komga.Message.ClickedSeries({ seriesId: "zzz" })).model.booksDialog
        .isOpen,
    ).toBe(false)
  })

  test("books only count for the series that is open", () => {
    const open = Komga.update(loaded(), Komga.Message.ClickedSeries({ seriesId: "s1" })).model
    const books = [makeBook()]
    expect(
      AsyncData.getData(
        Komga.update(open, Komga.Message.SucceededFetchBooks({ seriesId: "s1", books })).model
          .books,
      ),
    ).toStrictEqual(Option.some(books))
    expect(
      Komga.update(open, Komga.Message.SucceededFetchBooks({ seriesId: "s2", books })).model,
    ).toStrictEqual(open)
    expect(
      Komga.update(open, Komga.Message.FailedFetchBooks({ seriesId: "s2", reason: "x" })).model,
    ).toStrictEqual(open)
    expect(
      AsyncData.isFailure(
        Komga.update(open, Komga.Message.FailedFetchBooks({ seriesId: "s1", reason: "x" })).model
          .books,
      ),
    ).toBe(true)
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
  const down = { _tag: "KomgaHttpError", message: "komga down" }

  test("config, libraries and thumbnails", async () => {
    const config = await run(Komga.FetchConfig().effect, json(200, { komga: configured }))
    expect(config._tag === "SucceededFetchConfig" && config.komga.defaultLibraryId).toBe("L1")
    expect(
      await run(Komga.FetchLibraries().effect, json(200, [{ id: "L1", name: "Manga" }])),
    ).toStrictEqual(
      Komga.Message.SucceededFetchLibraries({ libraries: [{ id: "L1", name: "Manga" }] }),
    )
    expect(await run(Komga.FetchLibraries().effect, json(502, down))).toStrictEqual(
      Komga.Message.FailedFetchLibraries({ reason: "komga down" }),
    )
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    expect(
      await run(
        Komga.FetchThumbnail({ seriesId: "s1" }).effect,
        json(200, { thumbnail: "data:x" }),
        seen,
      ),
    ).toStrictEqual(Komga.Message.SucceededFetchThumbnail({ seriesId: "s1", url: "data:x" }))
    expect(Array.from(seen[0]?.urlParams ?? [])).toContainEqual(["seriesId", "s1"])
    expect(
      await run(Komga.FetchThumbnail({ seriesId: "s1" }).effect, json(502, down)),
    ).toStrictEqual(Komga.Message.FailedFetchThumbnail({ seriesId: "s1" }))
  })

  test("series: all libraries sends no libraryId, one library sends it", async () => {
    const all: Array<HttpClientRequest.HttpClientRequest> = []
    await run(Komga.FetchSeries({ libraryId: "" }).effect, json(200, [berserk]), all)
    expect(requestBody(all[0])).not.toHaveProperty("libraryId")
    const one: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Komga.FetchSeries({ libraryId: "L2" }).effect,
      json(200, [berserk]),
      one,
    )
    expect(requestBody(one[0])).toMatchObject({ libraryId: "L2" })
    expect(message).toStrictEqual(
      Komga.Message.SucceededFetchSeries({ libraryId: "L2", series: [berserk] }),
    )
    expect(await run(Komga.FetchSeries({ libraryId: "L2" }).effect, json(502, down))).toStrictEqual(
      Komga.Message.FailedFetchSeries({ libraryId: "L2", reason: "komga down" }),
    )
  })

  test("books", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    expect(
      await run(Komga.FetchBooks({ seriesId: "s1" }).effect, json(200, [makeBook()]), seen),
    ).toStrictEqual(Komga.Message.SucceededFetchBooks({ seriesId: "s1", books: [makeBook()] }))
    expect(requestBody(seen[0])).toMatchObject({ seriesId: "s1" })
    expect(await run(Komga.FetchBooks({ seriesId: "s1" }).effect, json(502, down))).toStrictEqual(
      Komga.Message.FailedFetchBooks({ seriesId: "s1", reason: "komga down" }),
    )
  })
})

const requestBody = (request: HttpClientRequest.HttpClientRequest | undefined): unknown =>
  request?.body._tag === "Uint8Array"
    ? JSON.parse(new TextDecoder().decode(request.body.body))
    : undefined

const withPage = (page: Komga.Model) => ({ ...modelAt(AppRoute.Komga()), komga: page })
const resolveCards = (ids: ReadonlyArray<string>) =>
  ids.flatMap((seriesId) => [
    Mount.resolve(Komga.ObserveVisible({ seriesId }), Komga.Message.BecameVisible({ seriesId })),
    // Becoming visible starts the thumbnail fetch; these scenes don't care how it ends.
    Command.resolve(Komga.FetchThumbnail, Komga.Message.FailedFetchThumbnail({ seriesId })),
  ])

describe("view", () => {
  test("header, count, chips and series cards", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      ...resolveCards(["s1", "s2"]),
      sceneExpect(text("III — KOMGA")).toExist(),
      sceneExpect(role("heading", { name: "Library" })).toExist(),
      sceneExpect(text("2 series")).toExist(),
      sceneExpect(role("button", { name: "All" })).toHaveAttr("aria-pressed", "false"),
      sceneExpect(role("button", { name: "Manga" })).toHaveAttr("aria-pressed", "true"),
      sceneExpect(selector("[data-series='s1']")).toContainText("Berserk"),
      sceneExpect(selector("[data-series='s1']")).toContainText("41 books"),
      sceneExpect(selector("[data-series='s1']")).toContainText("ONGOING"),
      sceneExpect(selector("[data-series='s2']")).toContainText("1 book"),
    )
  })

  test("the filter box narrows the grid to matching series", () => {
    const filtered = Komga.update(loaded(), Komga.Message.ChangedFilter({ value: "vaga" })).model
    scene(
      { update, view },
      given(withPage(filtered)),
      ...resolveCards(["s2"]),
      sceneExpect(selector("[data-series='s1']")).toBeAbsent(),
      sceneExpect(selector("[data-series='s2']")).toExist(),
      sceneExpect(label("Filter series")).toHaveValue("vaga"),
    )
  })

  test("typing in the filter box updates the filter", () => {
    scene(
      { update, view },
      given(
        withPage({
          ...loaded(),
          series: Komga.update(
            loaded(),
            Komga.Message.SucceededFetchSeries({ libraryId: "L1", series: [] }),
          ).model.series,
        }),
      ),
      type(label("Filter series"), "ber"),
      sceneExpect(label("Filter series")).toHaveValue("ber"),
    )
  })

  test("a filter with no matches explains itself", () => {
    const none = Komga.update(loaded(), Komga.Message.ChangedFilter({ value: "zzz" })).model
    scene(
      { update, view },
      given(withPage(none)),
      sceneExpect(text("No matches")).toExist(),
      sceneExpect(text("No series match your search.")).toExist(),
    )
  })

  test("an empty library says so", () => {
    const empty = Komga.update(
      loaded(),
      Komga.Message.SucceededFetchSeries({ libraryId: "L1", series: [] }),
    ).model
    scene(
      { update, view },
      given(withPage(empty)),
      sceneExpect(text("Nothing on the shelf")).toExist(),
      sceneExpect(text("No series found in Komga.")).toExist(),
    )
  })

  test("loading and failure states", () => {
    const loading = Komga.update(
      Komga.enter(Komga.init()).model,
      Komga.Message.SucceededFetchConfig({ komga: configured }),
    ).model
    scene(
      { update, view },
      given(withPage(loading)),
      sceneExpect(text("Loading library...")).toExist(),
      sceneExpect(role("button", { name: "Loading..." })).toBeDisabled(),
    )
    const failed = Komga.update(
      loading,
      Komga.Message.FailedFetchSeries({ libraryId: "L1", reason: "komga down" }),
    ).model
    scene(
      { update, view },
      given(withPage(failed)),
      sceneExpect(role("alert")).toContainText("komga down"),
    )
  })

  test("choosing a library switches the shelf", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      ...resolveCards(["s1", "s2"]),
      click(role("button", { name: "Novels" })),
      Mount.expectEnded(Komga.ObserveVisible({ seriesId: "s1" })),
      Mount.expectEnded(Komga.ObserveVisible({ seriesId: "s2" })),
      Command.resolve(
        Komga.FetchSeries,
        Komga.Message.SucceededFetchSeries({
          libraryId: "L2",
          series: [makeSeries({ id: "s9", metadata: { status: "ONGOING", title: "Emma" } })],
        }),
      ),
      ...resolveCards(["s9"]),
      sceneExpect(role("button", { name: "Novels" })).toHaveAttr("aria-pressed", "true"),
      sceneExpect(selector("[data-series='s9']")).toContainText("Emma"),
      sceneExpect(selector("[data-series='s1']")).toBeAbsent(),
    )
  })

  test("a visible card fetches its thumbnail and shows it", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      Mount.resolve(
        Komga.ObserveVisible({ seriesId: "s1" }),
        Komga.Message.BecameVisible({ seriesId: "s1" }),
      ),
      Command.resolve(
        Komga.FetchThumbnail,
        Komga.Message.SucceededFetchThumbnail({ seriesId: "s1", url: "data:image/png;base64,AA" }),
      ),
      Mount.resolve(
        Komga.ObserveVisible({ seriesId: "s2" }),
        Komga.Message.BecameVisible({ seriesId: "s2" }),
      ),
      Command.resolve(Komga.FetchThumbnail, Komga.Message.FailedFetchThumbnail({ seriesId: "s2" })),
      sceneExpect(selector("[data-series='s1'] img")).toHaveAttr("src", "data:image/png;base64,AA"),
      sceneExpect(selector("[data-series='s1'] img")).toHaveAttr("alt", "Berserk"),
      sceneExpect(selector("[data-series='s2'] img")).toBeAbsent(),
    )
  })

  test("clicking a series opens its books", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      ...resolveCards(["s1", "s2"]),
      click(selector("[data-series='s1']")),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("dialog", { name: "Berserk" })).toExist(),
      sceneExpect(text("Loading books...")).toExist(),
      Command.resolve(
        Komga.FetchBooks,
        Komga.Message.SucceededFetchBooks({
          seriesId: "s1",
          books: [
            makeBook(),
            makeBook({
              id: "b2",
              metadata: { title: "", number: "" },
              name: "extra.cbz",
              media: { pagesCount: 0, mediaType: "x" },
              size: "",
              created: "",
            }),
          ],
        }),
      ),
      sceneExpect(text("Volume 1")).toExist(),
      sceneExpect(selector("[data-field='pages']")).toHaveText("224 pages"),
      sceneExpect(selector("[data-field='number']")).toHaveText("#1"),
      sceneExpect(text("extra.cbz")).toExist(),
    )
  })

  test("an empty or failed book list is explained", () => {
    const open = Komga.update(loaded(), Komga.Message.ClickedSeries({ seriesId: "s1" })).model
    const empty = Komga.update(
      open,
      Komga.Message.SucceededFetchBooks({ seriesId: "s1", books: [] }),
    ).model
    scene(
      { update, view },
      given(withPage(empty)),
      ...resolveCards(["s1", "s2"]),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(text("No books found.")).toExist(),
    )
    const failed = Komga.update(
      open,
      Komga.Message.FailedFetchBooks({ seriesId: "s1", reason: "boom" }),
    ).model
    scene(
      { update, view },
      given(withPage(failed)),
      ...resolveCards(["s1", "s2"]),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("alert")).toContainText("boom"),
    )
  })
})

describe("wiring", () => {
  const names = (path: string) =>
    init(Option.getOrThrow(parseUrl(`http://localhost${path}`))).commands?.map((c) => c.name) ?? []

  test("a cold load on /komga checks settings; elsewhere it doesn't", () => {
    expect(names("/komga")).toContain("FetchKomgaConfig")
    expect(names("/watches")).not.toContain("FetchKomgaConfig")
  })

  test("navigating to /komga loads once; missing credentials redirect to Settings with the flag, but only if still on the page", () => {
    const url = Option.getOrThrow(parseUrl("http://localhost/komga"))
    const entered = update(modelAt(AppRoute.Watches()), Message.ChangedUrl({ url }))
    expect(entered.commands?.map((c) => c.name)).toContain("FetchKomgaConfig")
    expect(
      update(entered.model, Message.ChangedUrl({ url })).commands?.map((c) => c.name) ?? [],
    ).not.toContain("FetchKomgaConfig")
    const unconfigured = Komga.Message.SucceededFetchConfig({
      komga: { url: "", apiKey: "", defaultLibraryId: "" },
    })
    const redirected = update(entered.model, Message.GotKomgaMessage({ message: unconfigured }))
    expect(redirected.commands?.find((c) => c.name === "NavigateInternal")?.args).toStrictEqual({
      url: "/settings?komgaNotConfigured=true",
    })
    const away = update(
      modelAt(AppRoute.Watches()),
      Message.GotKomgaMessage({ message: unconfigured }),
    )
    expect(away.commands?.map((c) => c.name) ?? []).not.toContain("NavigateInternal")
  })
})

describe("visibilityStream (the real observer path)", () => {
  class FakeObserver {
    static last: FakeObserver | undefined
    disconnects = 0
    observed: Array<Element> = []
    constructor(
      readonly onChange: (entries: ReadonlyArray<{ readonly isIntersecting: boolean }>) => void,
      readonly options: { readonly rootMargin: string },
    ) {
      FakeObserver.last = this
    }
    observe(element: Element) {
      this.observed.push(element)
    }
    disconnect() {
      this.disconnects += 1
    }
  }
  const factory: Komga.ObserverFactory = (onChange, options) => new FakeObserver(onChange, options)

  test("emits once when the card first intersects, then stops watching", async () => {
    const element = document.createElement("button")
    const collected = Effect.runPromise(
      Stream.runCollect(
        Stream.take(Komga.visibilityStream(element, "s1", Option.some(factory)), 1),
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    const observer = FakeObserver.last
    expect(observer?.observed).toStrictEqual([element])
    expect(observer?.options.rootMargin).toBe("200px")
    observer?.onChange([{ isIntersecting: false }])
    expect(observer?.disconnects).toBe(0)
    observer?.onChange([{ isIntersecting: false }, { isIntersecting: true }])
    expect(await collected).toStrictEqual([Komga.Message.BecameVisible({ seriesId: "s1" })])
    expect((observer?.disconnects ?? 0) >= 1).toBe(true)
  })

  test("interrupting before it ever intersects still disconnects", async () => {
    const element = document.createElement("button")
    const fiber = Effect.runFork(
      Stream.runDrain(Komga.visibilityStream(element, "s1", Option.some(factory))),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    const observer = FakeObserver.last
    expect(observer?.disconnects).toBe(0)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(observer?.disconnects).toBe(1)
  })

  test("without observers it reports straight away", async () => {
    const out = await Effect.runPromise(
      Stream.runCollect(
        Komga.visibilityStream(document.createElement("button"), "s9", Option.none()),
      ),
    )
    expect(out).toStrictEqual([Komga.Message.BecameVisible({ seriesId: "s9" })])
  })
})

describe("more of the view", () => {
  test("a settings failure is shown, and Refresh is enabled to retry it", () => {
    const failed = Komga.update(
      Komga.init(),
      Komga.Message.FailedFetchConfig({ reason: "db locked" }),
    ).model
    scene(
      { update, view },
      given(withPage(failed)),
      sceneExpect(role("alert")).toContainText("Couldn't load your Komga settings: db locked"),
      sceneExpect(role("button", { name: "Refresh" })).toBeEnabled(),
      click(role("button", { name: "Refresh" })),
      Command.resolve(Komga.FetchConfig, Komga.Message.FailedFetchConfig({ reason: "still down" })),
      sceneExpect(role("alert")).toContainText("still down"),
    )
  })

  test("the selected chip is styled as active, the others are not", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      ...resolveCards(["s1", "s2"]),
      sceneExpect(role("button", { name: "Manga" })).toHaveClass("chip-active"),
      sceneExpect(role("button", { name: "Novels" })).not.toHaveClass("chip-active"),
      sceneExpect(role("button", { name: "All" })).not.toHaveClass("chip-active"),
    )
  })

  test("no chips when there are no libraries", () => {
    const none = {
      ...loaded(),
      libraries: Komga.update(Komga.init(), Komga.Message.FailedFetchLibraries({ reason: "x" }))
        .model.libraries,
    }
    scene(
      { update, view },
      given(withPage(none)),
      ...resolveCards(["s1", "s2"]),
      sceneExpect(role("button", { name: "All" })).toBeAbsent(),
    )
  })

  test("the series count is the whole library, not the filtered view, and appears only once loaded", () => {
    const filtered = Komga.update(loaded(), Komga.Message.ChangedFilter({ value: "vaga" })).model
    scene(
      { update, view },
      given(withPage(filtered)),
      ...resolveCards(["s2"]),
      sceneExpect(text("2 series")).toExist(),
    )
    const loading = Komga.update(
      Komga.enter(Komga.init()).model,
      Komga.Message.SucceededFetchConfig({ komga: configured }),
    ).model
    scene({ update, view }, given(withPage(loading)), sceneExpect(text("0 series")).toBeAbsent())
  })

  test("a failed refresh keeps the shelf and shows why", () => {
    const stale = Komga.update(
      Komga.update(loaded(), Komga.Message.ClickedRefresh()).model,
      Komga.Message.FailedFetchSeries({ libraryId: "L1", reason: "komga down" }),
    ).model
    scene(
      { update, view },
      given(withPage(stale)),
      ...resolveCards(["s1", "s2"]),
      sceneExpect(role("alert")).toContainText("komga down"),
      sceneExpect(selector("[data-series='s1']")).toExist(),
    )
  })

  test("a card whose thumbnail failed shows no image and no loading pulse", () => {
    const failedThumb = Komga.update(
      Komga.update(loaded(), Komga.Message.BecameVisible({ seriesId: "s1" })).model,
      Komga.Message.FailedFetchThumbnail({ seriesId: "s1" }),
    ).model
    scene(
      { update, view },
      given(withPage(failedThumb)),
      ...resolveCards(["s2"]),
      Mount.resolve(
        Komga.ObserveVisible({ seriesId: "s1" }),
        Komga.Message.BecameVisible({ seriesId: "s1" }),
      ),
      sceneExpect(selector("[data-series='s1'] img")).toBeAbsent(),
      sceneExpect(selector("[data-series='s1'] .animate-pulse")).toBeAbsent(),
    )
  })

  test("the books dialog shows a subtitle, and only the fields a book has", () => {
    const open = Komga.update(loaded(), Komga.Message.ClickedSeries({ seriesId: "s1" })).model
    const bare = makeBook({
      id: "b2",
      name: "extra.cbz",
      metadata: { title: "", number: "" },
      media: { pagesCount: 0, mediaType: "x" },
      size: "",
      created: "",
    })
    const withBooks = Komga.update(
      open,
      Komga.Message.SucceededFetchBooks({ seriesId: "s1", books: [makeBook(), bare] }),
    ).model
    scene(
      { update, view },
      given(withPage(withBooks)),
      ...resolveCards(["s1", "s2"]),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(text("41 books · ONGOING")).toExist(),
      sceneExpect(selector("[data-field='size']")).toHaveText("50.0 MiB"),
      sceneExpect(selector("[data-field='created']")).not.toHaveText("2026-01-15T10:00:00Z"),
      expectAll(all.selector("[data-field='pages']")).toHaveCount(1),
      expectAll(all.selector("[data-field='size']")).toHaveCount(1),
      expectAll(all.selector("[data-field='created']")).toHaveCount(1),
      expectAll(all.selector("[data-field='number']")).toHaveCount(1),
    )
  })
})
