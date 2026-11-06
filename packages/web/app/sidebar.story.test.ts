import { Duration, Effect, Layer, Option, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { HttpClient, HttpClientResponse } from "effect/http"
import { Command, given, message, model, story } from "foldkit/story"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as Sidebar from "./sidebar"

const base = Sidebar.init().model

describe("init", () => {
  test("starts closed with no Copyparty link and no unread, and fetches both", () => {
    const { model: initial, commands } = Sidebar.init()
    expect(initial.mobileNav.isOpen).toBe(false)
    expect(initial.maybeCopypartyUrl).toStrictEqual(Option.none())
    expect(initial.unreadCount).toBe(0)
    expect(commands?.map((c) => c.name)).toStrictEqual(["FetchCopypartyUrl", "FetchUnreadCount"])
  })
})

describe("update", () => {
  test("a fetched Copyparty URL is stored", () => {
    story(
      Sidebar.update,
      given(base),
      message(
        Sidebar.Message.CompletedFetchCopypartyUrl({ maybeUrl: Option.some("http://copy.party") }),
      ),
      model((m) => {
        expect(m.maybeCopypartyUrl).toStrictEqual(Option.some("http://copy.party"))
      }),
    )
  })

  test("a fetched unread count replaces the previous one", () => {
    story(
      Sidebar.update,
      given({ ...base, unreadCount: 2 }),
      message(Sidebar.Message.CompletedFetchUnreadCount({ maybeCount: Option.some(7) })),
      model((m) => {
        expect(m.unreadCount).toBe(7)
      }),
    )
  })

  test("a failed unread poll keeps the last known count", () => {
    story(
      Sidebar.update,
      given({ ...base, unreadCount: 5 }),
      message(Sidebar.Message.CompletedFetchUnreadCount({ maybeCount: Option.none() })),
      model((m) => {
        expect(m.unreadCount).toBe(5)
      }),
    )
  })

  test("each tick re-fetches the unread count", () => {
    story(
      Sidebar.update,
      given(base),
      message(Sidebar.Message.TickedRefreshUnreadCount()),
      Command.expectHas(Sidebar.FetchUnreadCount()),
      Command.resolve(
        Sidebar.FetchUnreadCount,
        Sidebar.Message.CompletedFetchUnreadCount({ maybeCount: Option.some(1) }),
      ),
      model((m) => {
        expect(m.unreadCount).toBe(1)
      }),
    )
  })

  test("refresh entry points fetch without changing state", () => {
    const withCopyparty = {
      ...base,
      maybeCopypartyUrl: Option.some("http://c.p"),
      unreadCount: 4,
    }
    const unread = Sidebar.refreshUnreadCount(withCopyparty)
    expect(unread.model).toStrictEqual(withCopyparty)
    expect(unread.commands?.map((c) => c.name)).toStrictEqual(["FetchUnreadCount"])
    const copyparty = Sidebar.refreshCopypartyUrl(withCopyparty)
    expect(copyparty.model).toStrictEqual(withCopyparty)
    expect(copyparty.commands?.map((c) => c.name)).toStrictEqual(["FetchCopypartyUrl"])
  })

  test("opening the drawer marks the dialog open", () => {
    const { model: opened } = Sidebar.update(base, Sidebar.Message.ClickedOpenMobileNav())
    expect(opened.mobileNav.isOpen).toBe(true)
  })

  test("closeMobileNav closes an open drawer and is a no-op when already closed", () => {
    const opened = Sidebar.update(base, Sidebar.Message.ClickedOpenMobileNav()).model
    expect(Sidebar.closeMobileNav(opened).model.mobileNav.isOpen).toBe(false)
    expect(Sidebar.closeMobileNav(base).model.mobileNav.isOpen).toBe(false)
  })
})

describe("subscriptions", () => {
  const entry = Sidebar.subscriptions.refreshUnreadCount

  test("nothing is emitted at t=0 (init already fetched), then one tick per 30s", async () => {
    const emitted = await Effect.runPromise(
      Effect.gen(function* () {
        const ticks = yield* Ref.make(0)
        yield* entry.dependenciesToStream({}).pipe(
          Stream.runForEach(() => Ref.update(ticks, (n) => n + 1)),
          Effect.forkScoped,
        )

        yield* TestClock.adjust(Duration.seconds(29))
        const beforeFirst = yield* Ref.get(ticks)
        yield* TestClock.adjust(Duration.seconds(1))
        const afterFirst = yield* Ref.get(ticks)
        yield* TestClock.adjust(Duration.seconds(30))
        const afterSecond = yield* Ref.get(ticks)
        return [beforeFirst, afterFirst, afterSecond]
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    )

    expect(emitted).toStrictEqual([0, 1, 2])
  })
})

describe("unreadBadgeText", () => {
  test.each([
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [4000, "99+"],
  ])("%i -> %s", (count, text) => {
    expect(Sidebar.unreadBadgeText(count)).toBe(text)
  })
})

describe("Commands (against a stubbed API)", () => {
  const run = <A>(
    command: { readonly effect: Effect.Effect<A, never, ApiClientService> },
    respond: () => Response,
  ) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, respond()))),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromise(command.effect.pipe(Effect.provide(layer)))
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  test("unread count: success is clamped to a non-negative integer", async () => {
    expect(await run(Sidebar.FetchUnreadCount(), json(200, { count: 3 }))).toStrictEqual(
      Sidebar.Message.CompletedFetchUnreadCount({ maybeCount: Option.some(3) }),
    )
    expect(await run(Sidebar.FetchUnreadCount(), json(200, { count: -2 }))).toStrictEqual(
      Sidebar.Message.CompletedFetchUnreadCount({ maybeCount: Option.some(0) }),
    )
  })

  test("unread count: absurd values stay safe integers", async () => {
    expect(await run(Sidebar.FetchUnreadCount(), json(200, { count: 1e20 }))).toStrictEqual(
      Sidebar.Message.CompletedFetchUnreadCount({
        maybeCount: Option.some(Number.MAX_SAFE_INTEGER),
      }),
    )
  })

  test("unread count: a server error is swallowed into None", async () => {
    expect(
      await run(Sidebar.FetchUnreadCount(), json(500, { _tag: "WatchStoreError", message: "db" })),
    ).toStrictEqual(Sidebar.Message.CompletedFetchUnreadCount({ maybeCount: Option.none() }))
  })

  test("copyparty: a configured URL becomes Some, an empty one None", async () => {
    expect(
      await run(Sidebar.FetchCopypartyUrl(), json(200, { copyparty: { url: "http://c.p" } })),
    ).toStrictEqual(
      Sidebar.Message.CompletedFetchCopypartyUrl({ maybeUrl: Option.some("http://c.p") }),
    )
    expect(
      await run(Sidebar.FetchCopypartyUrl(), json(200, { copyparty: { url: "" } })),
    ).toStrictEqual(Sidebar.Message.CompletedFetchCopypartyUrl({ maybeUrl: Option.none() }))
  })

  test("copyparty: a failure is swallowed into None", async () => {
    expect(
      await run(Sidebar.FetchCopypartyUrl(), json(500, { _tag: "ConfigLoadError", message: "x" })),
    ).toStrictEqual(Sidebar.Message.CompletedFetchCopypartyUrl({ maybeUrl: Option.none() }))
  })
})
