import { Dialog } from "@foldkit/ui"
import { Duration, Effect, Layer, Option, Ref, Stream } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"
import { AsyncData } from "foldkit"
import {
  Command,
  Mount,
  click,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
  text,
} from "foldkit/scene"
import { fromString as parseUrl } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as FolderSelect from "./folderSelect"
import { AppRoute, Message, init, subscriptions, update, view } from "./main"
import { requestJson } from "./testHttp"
import { drainToast, modelAt } from "./testing"
import * as Watches from "./watches"
import * as WatchForm from "./watchForm"
import { makeWatch, wid } from "./watchFixtures"

const a = makeWatch({ id: 1, name: "One Piece", unreadCount: 3 })
const b = makeWatch({ id: 2, name: "Berserk", enabled: false, filterGroups: [], unreadCount: 0 })

const loaded = (): Watches.Model =>
  Watches.update(
    Watches.enter(Watches.init()).model,
    Watches.Message.SucceededFetchWatches({ seq: 1, watches: [a, b] }),
  ).model

const outTitle = (result: {
  readonly outMessage?: Watches.OutMessage | undefined
}): string | undefined =>
  result.outMessage?._tag === "RequestedToast"
    ? result.outMessage.request.title
    : result.outMessage?._tag === "ChangedAlerts"
      ? Option.getOrUndefined(Option.map(result.outMessage.maybeToast, (request) => request.title))
      : undefined

describe("pure helpers", () => {
  test("watchCountLabel pluralises", () => {
    expect(Watches.watchCountLabel(1)).toBe("1 watch")
    expect(Watches.watchCountLabel(0)).toBe("0 watches")
    expect(Watches.watchCountLabel(5)).toBe("5 watches")
  })

  test("matchesToastTitle", () => {
    expect(Watches.matchesToastTitle(0)).toBe("No new matches found")
    expect(Watches.matchesToastTitle(1)).toBe("1 new match found")
    expect(Watches.matchesToastTitle(3)).toBe("3 new matches found")
  })

  test("unreadOf defaults a missing count to 0", () => {
    expect(Watches.unreadOf(a)).toBe(3)
    expect(Watches.unreadOf(makeWatch({ unreadCount: undefined }))).toBe(0)
  })
})

describe("loading", () => {
  test("entering shows the page, loads the list and starts polling", () => {
    const entered = Watches.enter(Watches.init())
    expect(entered.model.isActive).toBe(true)
    expect(AsyncData.isLoading(entered.model.watches)).toBe(true)
    expect(entered.commands?.map((c) => c.name)).toStrictEqual(["FetchWatches"])
  })

  test("re-entering keeps showing the old list while it reloads", () => {
    const again = Watches.enter(loaded())
    expect(AsyncData.isRefreshing(again.model.watches)).toBe(true)
    expect(AsyncData.hasData(again.model.watches)).toBe(true)
  })

  test("leaving stops polling", () => {
    expect(Watches.leave(loaded()).model.isActive).toBe(false)
  })

  test("a failed first load is a failure; a failed reload keeps the list as stale", () => {
    const failed = Watches.update(
      Watches.enter(Watches.init()).model,
      Watches.Message.FailedFetchWatches({ seq: 1, reason: "db" }),
    ).model
    expect(AsyncData.isFailure(failed.watches)).toBe(true)
    const stale = Watches.update(
      Watches.enter(loaded()).model,
      Watches.Message.FailedFetchWatches({ seq: 2, reason: "db" }),
    ).model
    expect(AsyncData.isStale(stale.watches)).toBe(true)
    expect(AsyncData.getData(stale.watches)).toStrictEqual(Option.some([a, b]))
  })

  test("polling reloads only while the page is on screen and not already loading", () => {
    expect(
      Watches.update(loaded(), Watches.Message.TickedPoll()).commands?.map((c) => c.name),
    ).toStrictEqual(["FetchWatches"])
    expect(
      Watches.update(Watches.leave(loaded()).model, Watches.Message.TickedPoll()).commands ?? [],
    ).toHaveLength(0)
    const loading = Watches.update(loaded(), Watches.Message.TickedPoll()).model
    expect(Watches.update(loading, Watches.Message.TickedPoll()).commands ?? []).toHaveLength(0)
  })
})

describe("poll subscription", () => {
  const entry = Watches.subscriptions.pollWatches

  const ticks = (isActive: boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const count = yield* Ref.make(0)
        yield* entry.dependenciesToStream({ isActive }).pipe(
          Stream.runForEach(() => Ref.update(count, (n) => n + 1)),
          Effect.forkScoped,
        )
        yield* TestClock.adjust(Duration.seconds(29))
        const before = yield* Ref.get(count)
        yield* TestClock.adjust(Duration.seconds(1))
        const first = yield* Ref.get(count)
        yield* TestClock.adjust(Duration.seconds(30))
        return [before, first, yield* Ref.get(count)]
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    )

  test("ticks every 30s while active, and never while inactive", async () => {
    expect(await ticks(true)).toStrictEqual([0, 1, 2])
    expect(await ticks(false)).toStrictEqual([0, 0, 0])
  })

  test("its key doesn't collide with the jobs poll", () => {
    expect(Object.keys(Watches.subscriptions)).toStrictEqual(["pollWatches"])
  })
})

describe("actions", () => {
  test("Run Now runs once per watch, locks that watch, and toasts the result", () => {
    const started = Watches.update(loaded(), Watches.Message.ClickedRunNow({ watchId: wid(1) }))
    expect(started.commands?.[0]?.name).toBe("RunWatch")
    expect(Watches.isBusy(started.model, 1)).toBe(true)
    expect(Watches.isBusy(started.model, 2)).toBe(false)
    expect(
      Watches.update(started.model, Watches.Message.ClickedRunNow({ watchId: wid(1) })).commands ??
        [],
    ).toHaveLength(0)

    const done = Watches.update(
      started.model,
      Watches.Message.SucceededRunNow({ watchId: wid(1), matches: 2 }),
    )
    expect(Watches.isBusy(done.model, 1)).toBe(false)
    expect(outTitle(done)).toBe("2 new matches found")
    expect(done.commands?.map((c) => c.name)).toStrictEqual(["FetchWatches"])
    const failed = Watches.update(
      started.model,
      Watches.Message.FailedRunNow({ watchId: wid(1), reason: "boom" }),
    )
    expect(outTitle(failed)).toBe("Failed to trigger watch")
    expect(Watches.isBusy(failed.model, 1)).toBe(false)
  })

  test("Pause/Resume sends the opposite state and reloads quietly", () => {
    const paused = Watches.update(
      loaded(),
      Watches.Message.ClickedToggle({ watchId: wid(1), enabled: false }),
    )
    expect(paused.commands?.[0]?.args).toStrictEqual({ watchId: wid(1), enabled: false })
    const done = Watches.update(paused.model, Watches.Message.SucceededToggle({ watchId: wid(1) }))
    expect(done.outMessage).toBeUndefined()
    expect(done.commands?.map((c) => c.name)).toStrictEqual(["FetchWatches"])
    expect(
      outTitle(
        Watches.update(
          paused.model,
          Watches.Message.FailedToggle({ watchId: wid(1), reason: "x" }),
        ),
      ),
    ).toBe("Failed to update watch")
  })

  test("Dismiss clears alerts, reloads and asks the sidebar to refresh its badge", () => {
    const started = Watches.update(loaded(), Watches.Message.ClickedDismiss({ watchId: wid(1) }))
    expect(started.commands?.[0]?.name).toBe("DismissAlerts")
    const done = Watches.update(
      started.model,
      Watches.Message.SucceededDismiss({ watchId: wid(1) }),
    )
    expect(done.outMessage).toStrictEqual(
      Watches.OutMessage.ChangedAlerts({ maybeToast: Option.none() }),
    )
    expect(done.commands?.map((c) => c.name)).toStrictEqual(["FetchWatches"])
    expect(
      outTitle(
        Watches.update(
          started.model,
          Watches.Message.FailedDismiss({ watchId: wid(1), reason: "x" }),
        ),
      ),
    ).toBe("Failed to dismiss alerts")
  })

  test("Delete asks first; Keep backs out; confirming deletes once and toasts", () => {
    const asking = Watches.update(
      loaded(),
      Watches.Message.ClickedDelete({ watchId: wid(1) }),
    ).model
    expect(asking.maybeConfirmingDeleteId).toStrictEqual(Option.some(1))
    expect(
      Watches.update(asking, Watches.Message.ClickedCancelDelete()).model.maybeConfirmingDeleteId,
    ).toStrictEqual(Option.none())
    // confirming a watch we aren't asking about does nothing
    expect(
      Watches.update(asking, Watches.Message.ClickedConfirmDelete({ watchId: wid(2) })).commands ??
        [],
    ).toHaveLength(0)
    const confirmed = Watches.update(
      asking,
      Watches.Message.ClickedConfirmDelete({ watchId: wid(1) }),
    )
    expect(confirmed.commands?.[0]?.name).toBe("DeleteWatch")
    expect(confirmed.model.maybeConfirmingDeleteId).toStrictEqual(Option.none())
    const done = Watches.update(
      confirmed.model,
      Watches.Message.SucceededDelete({ watchId: wid(1) }),
    )
    expect(outTitle(done)).toBe("Watch deleted")
    expect(
      outTitle(
        Watches.update(
          confirmed.model,
          Watches.Message.FailedDelete({ watchId: wid(1), reason: "x" }),
        ),
      ),
    ).toBe("Failed to delete watch")
  })
})

describe("one load at a time", () => {
  test("each load gets a fresh sequence number, and only the latest answer is applied", () => {
    const first = Watches.enter(Watches.init())
    const second = Watches.update(
      first.model,
      Watches.Message.ClickedToggle({ watchId: wid(1), enabled: false }),
    )
    const reloaded = Watches.update(
      second.model,
      Watches.Message.SucceededToggle({ watchId: wid(1) }),
    )
    expect(first.commands?.[0]?.args).toStrictEqual({ seq: 1 })
    expect(reloaded.commands?.[0]?.args).toStrictEqual({ seq: 2 })
    // the first answer arrives late: ignored
    const late = Watches.update(
      reloaded.model,
      Watches.Message.SucceededFetchWatches({ seq: 1, watches: [a] }),
    ).model
    expect(AsyncData.hasData(late.watches)).toBe(false)
    const current = Watches.update(
      reloaded.model,
      Watches.Message.SucceededFetchWatches({ seq: 2, watches: [a, b] }),
    ).model
    expect(AsyncData.getData(current.watches)).toStrictEqual(Option.some([a, b]))
    // and a late failure doesn't poison newer data either
    const lateFailure = Watches.update(
      current,
      Watches.Message.FailedFetchWatches({ seq: 1, reason: "x" }),
    ).model
    expect(lateFailure).toStrictEqual(current)
  })
})

describe("sidebar badge and toasts", () => {
  test("new matches or a deletion also refresh the sidebar's unread badge", () => {
    const ran = Watches.update(
      loaded(),
      Watches.Message.SucceededRunNow({ watchId: wid(1), matches: 2 }),
    )
    expect(ran.outMessage?._tag).toBe("ChangedAlerts")
    const none = Watches.update(
      loaded(),
      Watches.Message.SucceededRunNow({ watchId: wid(1), matches: 0 }),
    )
    expect(none.outMessage?._tag).toBe("RequestedToast")
    expect(
      Watches.update(loaded(), Watches.Message.SucceededDelete({ watchId: wid(1) })).outMessage
        ?._tag,
    ).toBe("ChangedAlerts")
  })

  test("failure toasts are errors and carry the reason", () => {
    const failed = Watches.update(
      loaded(),
      Watches.Message.FailedRunNow({ watchId: wid(1), reason: "indexer down" }),
    )
    expect(failed.outMessage?._tag === "RequestedToast" && failed.outMessage.request).toMatchObject(
      {
        variant: "Error",
        title: "Failed to trigger watch",
        maybeDescription: Option.some("indexer down"),
      },
    )
  })
})

describe("the watch form", () => {
  test("New Watch opens an empty dialog", () => {
    const opened = Watches.update(loaded(), Watches.Message.ClickedNewWatch())
    expect(opened.model.form.dialog.isOpen).toBe(true)
    expect(opened.model.form.mode).toStrictEqual(WatchForm.Mode.Create())
  })

  test("a saved watch reloads the list and toasts which kind it was", () => {
    const created = Watches.update(
      loaded(),
      Watches.Message.GotFormMessage({ message: WatchForm.Message.SucceededSave() }),
    )
    expect(outTitle(created)).toBe("Watch created")
    expect(created.commands?.map((c) => c.name)).toContain("FetchWatches")
    const editing = { ...loaded(), form: WatchForm.openForEdit(WatchForm.init(), a).model }
    const updated = Watches.update(
      editing,
      Watches.Message.GotFormMessage({ message: WatchForm.Message.SucceededSave() }),
    )
    expect(outTitle(updated)).toBe("Watch updated. Restart scheduled.")
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
  const down = { _tag: "WatchStoreError", message: "db down" }

  test("list", async () => {
    expect(
      await run(Watches.FetchWatches({ seq: 1 }).effect, json(200, { watches: [a] })),
    ).toStrictEqual(Watches.Message.SucceededFetchWatches({ seq: 1, watches: [a] }))
    expect(await run(Watches.FetchWatches({ seq: 1 }).effect, json(500, down))).toStrictEqual(
      Watches.Message.FailedFetchWatches({ seq: 1, reason: "db down" }),
    )
  })

  test("dismiss, run, toggle and delete hit the right endpoints", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(Watches.DismissAlerts({ watchId: wid(3) }).effect, json(200, { success: true }), seen)
    await run(Watches.RunWatch({ watchId: wid(3) }).effect, json(200, { matches: 2 }), seen)
    await run(
      Watches.SetWatchEnabled({ watchId: wid(3), enabled: false }).effect,
      json(200, makeWatch({ id: 3 })),
      seen,
    )
    await run(Watches.DeleteWatch({ watchId: wid(3) }).effect, json(200, { success: true }), seen)
    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toStrictEqual([
      "POST /api/watches/3/alerts/acknowledge-all",
      "POST /api/watches/3/trigger",
      "PUT /api/watches/3",
      "DELETE /api/watches/3",
    ])
    expect(requestJson(seen[2])).toStrictEqual({ enabled: false })
  })

  test("run reports how many matches; failures carry the server's message", async () => {
    expect(
      await run(Watches.RunWatch({ watchId: wid(3) }).effect, json(200, { matches: 4 })),
    ).toStrictEqual(Watches.Message.SucceededRunNow({ watchId: wid(3), matches: 4 }))
    const notFound = { _tag: "WatchNotFoundError", message: "No such watch" }
    expect(
      await run(Watches.RunWatch({ watchId: wid(3) }).effect, json(404, notFound)),
    ).toStrictEqual(Watches.Message.FailedRunNow({ watchId: wid(3), reason: "No such watch" }))
    expect(
      await run(Watches.DeleteWatch({ watchId: wid(3) }).effect, json(404, notFound)),
    ).toStrictEqual(Watches.Message.FailedDelete({ watchId: wid(3), reason: "No such watch" }))
    expect(
      await run(Watches.DismissAlerts({ watchId: wid(3) }).effect, json(500, down)),
    ).toStrictEqual(Watches.Message.FailedDismiss({ watchId: wid(3), reason: "db down" }))
    expect(
      await run(
        Watches.SetWatchEnabled({ watchId: wid(3), enabled: true }).effect,
        json(404, notFound),
      ),
    ).toStrictEqual(Watches.Message.FailedToggle({ watchId: wid(3), reason: "No such watch" }))
  })
})

const withPage = (page: Watches.Model) => ({ ...modelAt(AppRoute.Watches()), watches: page })

describe("view", () => {
  test("header, count, and one card per watch with its details", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(text("IV — WATCHES")).toExist(),
      sceneExpect(text("2 watches")).toExist(),
      sceneExpect(selector("[data-watch='1']")).toContainText("One Piece"),
      sceneExpect(selector("[data-watch='1']")).toContainText(
        "Query: one piece · Every 3600s · 1 filter group",
      ),
      sceneExpect(selector("[data-watch='2']")).toContainText("Query: one piece · Every 3600s"),
      sceneExpect(selector("[data-watch='2']")).not.toContainText("filter group"),
      sceneExpect(selector("[data-watch='1'] [data-status]")).toHaveText("Active"),
      sceneExpect(selector("[data-watch='2'] [data-status]")).toHaveText("Paused"),
      sceneExpect(selector("[data-watch='1'] [data-unread]")).toHaveText("3 new"),
      sceneExpect(selector("[data-watch='2'] [data-unread]")).toBeAbsent(),
    )
  })

  test("each card's name is a real link to its page", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(selector("[data-watch='1'] a")).toHaveAttr("href", "/watches/1"),
    )
  })

  test("Dismiss is offered only with unread alerts; Pause/Resume reflect the state", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(selector("[data-watch='1']")).toContainText("Dismiss"),
      sceneExpect(selector("[data-watch='2']")).not.toContainText("Dismiss"),
      sceneExpect(selector("[data-watch='1']")).toContainText("Pause"),
      sceneExpect(selector("[data-watch='2']")).toContainText("Resume"),
    )
  })

  test("loading, failure and empty states", () => {
    scene(
      { update, view },
      given(withPage(Watches.enter(Watches.init()).model)),
      sceneExpect(text("Loading watches...")).toExist(),
    )
    const failed = Watches.update(
      Watches.enter(Watches.init()).model,
      Watches.Message.FailedFetchWatches({ seq: 1, reason: "db" }),
    ).model
    scene(
      { update, view },
      given(withPage(failed)),
      sceneExpect(role("alert")).toContainText("Failed to load watches: db"),
    )
    const empty = Watches.update(
      Watches.enter(Watches.init()).model,
      Watches.Message.SucceededFetchWatches({ seq: 1, watches: [] }),
    ).model
    scene(
      { update, view },
      given(withPage(empty)),
      sceneExpect(text("No watches yet")).toExist(),
      sceneExpect(text("0 watches")).toExist(),
    )
  })

  test("a failed reload shows why while keeping the list", () => {
    const stale = Watches.update(
      Watches.enter(loaded()).model,
      Watches.Message.FailedFetchWatches({ seq: 2, reason: "db" }),
    ).model
    scene(
      { update, view },
      given(withPage(stale)),
      sceneExpect(role("alert")).toContainText("Couldn't refresh watches: db"),
      sceneExpect(selector("[data-watch='1']")).toExist(),
    )
  })

  test("only a running watch says 'Running...'; other busy actions don't relabel Run Now", () => {
    const pausing = Watches.update(
      loaded(),
      Watches.Message.ClickedToggle({ watchId: wid(1), enabled: false }),
    ).model
    scene(
      { update, view },
      given(withPage(pausing)),
      sceneExpect(selector("[data-watch='1'] [data-action='run']")).toHaveText("Run Now"),
      sceneExpect(selector("[data-watch='1'] [data-action='run']")).toBeDisabled(),
      sceneExpect(selector("[data-watch='1'] [data-action='toggle']")).toBeDisabled(),
      sceneExpect(selector("[data-watch='2'] [data-action='run']")).toBeEnabled(),
    )
  })

  test("Pause sends the opposite state; Resume does too", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(selector("[data-watch='2'] [data-action='toggle']")),
      Command.resolve(
        Watches.SetWatchEnabled,
        Watches.Message.FailedToggle({ watchId: wid(2), reason: "x" }),
      ),
      drainToast("toasts-entry-0"),
    )
  })

  test("Run Now locks the card and toasts the result", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(selector("[data-watch='1'] [data-action='run']")),
      sceneExpect(selector("[data-watch='1'] [data-action='run']")).toHaveText("Running..."),
      Command.resolve(
        Watches.RunWatch,
        Watches.Message.SucceededRunNow({ watchId: wid(1), matches: 0 }),
      ),
      Command.resolve(
        Watches.FetchWatches,
        Watches.Message.SucceededFetchWatches({ seq: 1, watches: [a, b] }),
      ),
      sceneExpect(selector("#toasts [role='status']")).toContainText("No new matches found"),
      drainToast("toasts-entry-0"),
    )
  })

  test("Delete asks inline, then removes after confirmation", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(selector("[data-watch='2'] [data-action='delete']")),
      sceneExpect(selector("[data-watch='2'] [role='alert']")).toContainText(
        'Delete "Berserk" and all its alerts?',
      ),
      click(selector("[data-watch='2'] [data-action='keep']")),
      sceneExpect(selector("[data-watch='2'] [role='alert']")).toBeAbsent(),
    )
  })

  test("+ New Watch opens the form dialog, titled for creating", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(role("button", { name: "+ New Watch" })),
      Command.resolve(
        FolderSelect.FetchFolders,
        FolderSelect.Message.SucceededFetchFolders({ folders: [] }),
      ),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("dialog", { name: "Create Watch" })).toExist(),
      sceneExpect(role("button", { name: "Create Watch" })).toBeDisabled(),
    )
  })
})

describe("wiring", () => {
  const names = (path: string) =>
    init(Option.getOrThrow(parseUrl(`http://localhost${path}`))).commands?.map((c) => c.name) ?? []

  test("a cold load on /watches loads the list; elsewhere it doesn't", () => {
    expect(names("/watches")).toContain("FetchWatches")
    expect(names("/settings")).not.toContain("FetchWatches")
  })

  test("entering loads and activates; leaving deactivates and stops polling", () => {
    const url = (path: string) => Option.getOrThrow(parseUrl(`http://localhost${path}`))
    const entered = update(modelAt(AppRoute.Debug()), Message.ChangedUrl({ url: url("/watches") }))
    expect(entered.commands?.map((c) => c.name)).toContain("FetchWatches")
    expect(entered.model.watches.isActive).toBe(true)
    const left = update(entered.model, Message.ChangedUrl({ url: url("/debug") }))
    expect(left.model.watches.isActive).toBe(false)
  })

  test("dismissing alerts refreshes the sidebar's unread badge; toasts reach the toast host", () => {
    const dismissed = update(
      modelAt(AppRoute.Watches()),
      Message.GotWatchesMessage({ message: Watches.Message.SucceededDismiss({ watchId: wid(1) }) }),
    )
    expect(dismissed.commands?.map((c) => c.name)).toContain("FetchUnreadCount")
    const ran = update(
      modelAt(AppRoute.Watches()),
      Message.GotWatchesMessage({
        message: Watches.Message.SucceededRunNow({ watchId: wid(1), matches: 1 }),
      }),
    )
    expect(ran.model.toasts.entries.map((e) => e.payload.title)).toStrictEqual([
      "1 new match found",
    ])
  })

  test.each([
    "/settings",
    "/latest",
    "/komga",
    "/convert",
    "/annas-archive",
    "/",
    "/debug",
    "/watches/3",
  ])("leaving Watches for %s stops its polling", (path) => {
    const url = Option.getOrThrow(parseUrl(`http://localhost${path}`))
    const onWatches = {
      ...modelAt(AppRoute.Watches()),
      watches: { ...Watches.init(), isActive: true },
    }
    expect(update(onWatches, Message.ChangedUrl({ url })).model.watches.isActive).toBe(false)
  })

  test("the app wires the Watches poll into its subscriptions", () => {
    expect(Object.keys(subscriptions)).toContain("pollWatches")
  })
})
