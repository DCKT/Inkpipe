import { Dialog } from "@foldkit/ui"
import * as FolderSelect from "./folderSelect"
import { Effect, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
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
import { AppRoute, Message, init, subscriptions, update, view } from "./main"
import { requestJson } from "./testHttp"
import { modelAt } from "./testing"
import * as WatchDetail from "./watchDetail"
import { aid, makeAlert, makeWatch, wid } from "./watchFixtures"
import * as WatchForm from "./watchForm"

const book = makeWatch({ id: 1, name: "One Piece", subfolder: "One%20Piece" })
const plain = makeWatch({ id: 1, name: "Anime", subfolder: null })
const fresh = makeAlert({ id: 10, title: "Vol 100" })
const read = makeAlert({ id: 11, title: "Vol 99", acknowledged: true })
const noLink = makeAlert({ id: 12, title: "Vol 98", magnetUrl: null, downloadUrl: null })

/** Entered on watch 1, with the watch and its alerts loaded (request 1 each). */
const loaded = (
  watch = book,
  alerts: ReadonlyArray<ReturnType<typeof makeAlert>> = [fresh, read],
): WatchDetail.Model => {
  const entered = WatchDetail.enter(WatchDetail.init(), wid(1)).model
  const withWatch = WatchDetail.update(
    entered,
    WatchDetail.Message.SucceededFetchWatch({ watchId: wid(1), seq: 1, watch }),
  ).model
  return WatchDetail.update(
    withWatch,
    WatchDetail.Message.SucceededFetchAlerts({ watchId: wid(1), seq: 1, alerts }),
  ).model
}

const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  result.commands?.map((c) => c.name) ?? []

const outTitle = (result: { readonly outMessage?: WatchDetail.OutMessage | undefined }) =>
  result.outMessage?._tag === "RequestedToast"
    ? result.outMessage.request.title
    : result.outMessage?._tag === "ChangedAlerts"
      ? Option.getOrUndefined(Option.map(result.outMessage.maybeToast, (request) => request.title))
      : undefined

describe("pure helpers", () => {
  test("only a watch with a folder is a book watch", () => {
    expect(WatchDetail.bookFolder(book)).toStrictEqual(Option.some("One%20Piece"))
    expect(WatchDetail.bookFolder(plain)).toStrictEqual(Option.none())
    expect(WatchDetail.bookFolder(makeWatch({ subfolder: "" }))).toStrictEqual(Option.none())
  })

  test("an alert needs a magnet or a download URL to be saved", () => {
    expect(WatchDetail.hasLink(fresh)).toBe(true)
    expect(
      WatchDetail.hasLink(makeAlert({ magnetUrl: null, downloadUrl: "http://x/y.torrent" })),
    ).toBe(true)
    expect(WatchDetail.hasLink(makeAlert({ magnetUrl: "", downloadUrl: "" }))).toBe(false)
    expect(WatchDetail.hasLink(noLink)).toBe(false)
  })

  test("counts what is still unread", () => {
    expect(WatchDetail.unacknowledgedCount([fresh, read, noLink])).toBe(2)
  })
})

describe("loading", () => {
  test("entering shows the page and loads the watch and its alerts", () => {
    const entered = WatchDetail.enter(WatchDetail.init(), wid(1))
    expect(names(entered)).toStrictEqual(["FetchWatch", "FetchAlerts"])
    expect(entered.model.isActive).toBe(true)
    expect(entered.model.maybeWatchId).toStrictEqual(Option.some(wid(1)))
    expect(AsyncData.isPending(entered.model.watch)).toBe(true)
    expect(AsyncData.isPending(entered.model.alerts)).toBe(true)
  })

  test("answers fill the page", () => {
    const model = loaded()
    expect(AsyncData.getData(model.watch)).toStrictEqual(Option.some(book))
    expect(AsyncData.getData(model.alerts)).toStrictEqual(Option.some([fresh, read]))
  })

  test("failures are kept, and a failed refresh keeps the data", () => {
    const entered = WatchDetail.enter(WatchDetail.init(), wid(1)).model
    const failed = WatchDetail.update(
      entered,
      WatchDetail.Message.FailedFetchWatch({ watchId: wid(1), seq: 1, reason: "Watch not found" }),
    ).model
    expect(AsyncData.getError(failed.watch)).toStrictEqual(Option.some("Watch not found"))
    const stale = WatchDetail.update(
      loaded(),
      WatchDetail.Message.FailedFetchAlerts({ watchId: wid(1), seq: 1, reason: "db down" }),
    ).model
    expect(AsyncData.isStale(stale.alerts)).toBe(true)
    expect(AsyncData.getData(stale.alerts)).toStrictEqual(Option.some([fresh, read]))
  })

  test("answers for another watch or an older request are ignored", () => {
    const entered = WatchDetail.enter(WatchDetail.init(), wid(1)).model
    const other = WatchDetail.update(
      entered,
      WatchDetail.Message.SucceededFetchWatch({ watchId: wid(2), seq: 1, watch: plain }),
    ).model
    expect(AsyncData.isPending(other.watch)).toBe(true)
    const old = WatchDetail.update(
      entered,
      WatchDetail.Message.SucceededFetchAlerts({ watchId: wid(1), seq: 0, alerts: [fresh] }),
    ).model
    expect(AsyncData.isPending(old.alerts)).toBe(true)
  })

  test("moving to another watch forgets the first and ignores its late answers", () => {
    const first = loaded()
    const moved = WatchDetail.enter(first, wid(2))
    expect(moved.model.maybeWatchId).toStrictEqual(Option.some(wid(2)))
    expect(AsyncData.isPending(moved.model.watch)).toBe(true)
    expect(moved.model.busy).toStrictEqual([])
    // The answer the first watch's request had in flight arrives late.
    const late = WatchDetail.update(
      moved.model,
      WatchDetail.Message.SucceededFetchAlerts({ watchId: wid(1), seq: 1, alerts: [fresh] }),
    ).model
    expect(AsyncData.isPending(late.alerts)).toBe(true)
    // Even re-entering the same watch can't be answered by the previous visit.
    const again = WatchDetail.enter(first, wid(1)).model
    const lateSame = WatchDetail.update(
      again,
      WatchDetail.Message.SucceededFetchAlerts({ watchId: wid(1), seq: 1, alerts: [fresh] }),
    ).model
    expect(AsyncData.isPending(lateSame.alerts)).toBe(true)
  })

  test("leaving stops the polling", () => {
    expect(WatchDetail.leave(loaded()).model.isActive).toBe(false)
  })
})

describe("polling", () => {
  test("a tick reloads only the alerts, only while on screen and not already loading", () => {
    expect(names(WatchDetail.update(loaded(), WatchDetail.Message.TickedPoll()))).toStrictEqual([
      "FetchAlerts",
    ])
    const left = WatchDetail.leave(loaded()).model
    expect(names(WatchDetail.update(left, WatchDetail.Message.TickedPoll()))).toStrictEqual([])
    const loading = WatchDetail.enter(WatchDetail.init(), wid(1)).model
    expect(names(WatchDetail.update(loading, WatchDetail.Message.TickedPoll()))).toStrictEqual([])
  })

  test("a refresh keeps the alerts on screen", () => {
    const reloading = WatchDetail.update(loaded(), WatchDetail.Message.TickedPoll()).model
    expect(AsyncData.getData(reloading.alerts)).toStrictEqual(Option.some([fresh, read]))
  })

  test("its key doesn't collide with the other polls", () => {
    expect(Object.keys(WatchDetail.subscriptions)).toStrictEqual(["pollAlerts"])
    expect(Object.keys(subscriptions)).toContain("pollAlerts")
  })
})

describe("acknowledging", () => {
  test("holds the alert while in flight, then reloads and refreshes the badge", () => {
    const started = WatchDetail.update(
      loaded(),
      WatchDetail.Message.ClickedAcknowledge({ alertId: aid(10) }),
    )
    expect(names(started)).toStrictEqual(["AcknowledgeAlert"])
    expect(WatchDetail.isAlertBusy(started.model, aid(10))).toBe(true)
    expect(
      names(
        WatchDetail.update(
          started.model,
          WatchDetail.Message.ClickedAcknowledge({ alertId: aid(10) }),
        ),
      ),
    ).toStrictEqual([])
    const done = WatchDetail.update(
      started.model,
      WatchDetail.Message.SucceededAcknowledge({ watchId: wid(1), alertId: aid(10) }),
    )
    expect(WatchDetail.isAlertBusy(done.model, aid(10))).toBe(false)
    expect(names(done)).toStrictEqual(["FetchAlerts"])
    expect(done.outMessage?._tag).toBe("ChangedAlerts")
  })

  test("a failure is reported and unlocks the alert", () => {
    const started = WatchDetail.update(
      loaded(),
      WatchDetail.Message.ClickedAcknowledge({ alertId: aid(10) }),
    )
    const failed = WatchDetail.update(
      started.model,
      WatchDetail.Message.FailedAcknowledge({
        watchId: wid(1),
        alertId: aid(10),
        reason: "db down",
      }),
    )
    expect(WatchDetail.isAlertBusy(failed.model, aid(10))).toBe(false)
    expect(outTitle(failed)).toBe("Failed to acknowledge alert")
  })

  test("acknowledge all is single-flight, reloads, and says so", () => {
    const started = WatchDetail.update(loaded(), WatchDetail.Message.ClickedAcknowledgeAll())
    expect(names(started)).toStrictEqual(["AcknowledgeAllAlerts"])
    expect(started.model.isAcknowledgingAll).toBe(true)
    expect(
      names(WatchDetail.update(started.model, WatchDetail.Message.ClickedAcknowledgeAll())),
    ).toStrictEqual([])
    const done = WatchDetail.update(
      started.model,
      WatchDetail.Message.SucceededAcknowledgeAll({ watchId: wid(1) }),
    )
    expect(done.model.isAcknowledgingAll).toBe(false)
    expect(names(done)).toStrictEqual(["FetchAlerts"])
    expect(outTitle(done)).toBe("All alerts acknowledged")
    const failed = WatchDetail.update(
      started.model,
      WatchDetail.Message.FailedAcknowledgeAll({ watchId: wid(1), reason: "db down" }),
    )
    expect(failed.model.isAcknowledgingAll).toBe(false)
    expect(outTitle(failed)).toBe("Failed to acknowledge alerts")
  })
})

describe("download (book watches)", () => {
  test("sends the alert to the watch's folder", () => {
    const started = WatchDetail.update(
      loaded(),
      WatchDetail.Message.ClickedDownload({ alertId: aid(10) }),
    )
    expect(names(started)).toStrictEqual(["DownloadAlert"])
    expect(WatchDetail.isAlertBusy(started.model, aid(10))).toBe(true)
  })

  test("does nothing for a non-book watch, an unknown alert, or before the watch loaded", () => {
    expect(
      names(
        WatchDetail.update(
          loaded(plain),
          WatchDetail.Message.ClickedDownload({ alertId: aid(10) }),
        ),
      ),
    ).toStrictEqual([])
    expect(
      names(
        WatchDetail.update(loaded(), WatchDetail.Message.ClickedDownload({ alertId: aid(99) })),
      ),
    ).toStrictEqual([])
    const loading = WatchDetail.enter(WatchDetail.init(), wid(1)).model
    expect(
      names(WatchDetail.update(loading, WatchDetail.Message.ClickedDownload({ alertId: aid(10) }))),
    ).toStrictEqual([])
  })

  test("success reloads, refreshes the badge and points to the Jobs page", () => {
    const started = WatchDetail.update(
      loaded(),
      WatchDetail.Message.ClickedDownload({ alertId: aid(10) }),
    )
    const done = WatchDetail.update(
      started.model,
      WatchDetail.Message.SucceededDownload({ watchId: wid(1), alertId: aid(10), started: 1 }),
    )
    expect(WatchDetail.isAlertBusy(done.model, aid(10))).toBe(false)
    expect(names(done)).toStrictEqual(["FetchAlerts"])
    expect(outTitle(done)).toBe("Started 1 download")
  })

  test("a failure is reported and unlocks the alert", () => {
    const started = WatchDetail.update(
      loaded(),
      WatchDetail.Message.ClickedDownload({ alertId: aid(10) }),
    )
    const failed = WatchDetail.update(
      started.model,
      WatchDetail.Message.FailedDownload({
        watchId: wid(1),
        alertId: aid(10),
        reason: "No Copyparty",
      }),
    )
    expect(WatchDetail.isAlertBusy(failed.model, aid(10))).toBe(false)
    expect(outTitle(failed)).toBe("Failed to start download")
  })
})

describe("save to magnet (non-book watches)", () => {
  test("saves an alert that has a link", () => {
    const started = WatchDetail.update(
      loaded(plain),
      WatchDetail.Message.ClickedSaveMagnet({ alertId: aid(10) }),
    )
    expect(names(started)).toStrictEqual(["SaveAlertMagnet"])
    const done = WatchDetail.update(
      started.model,
      WatchDetail.Message.SucceededSaveMagnet({ watchId: wid(1), alertId: aid(10) }),
    )
    expect(names(done)).toStrictEqual(["FetchAlerts"])
    expect(outTitle(done)).toBe("Saved to AllDebrid")
  })

  test("refuses an alert with no link", () => {
    const model = loaded(plain, [noLink])
    expect(
      names(WatchDetail.update(model, WatchDetail.Message.ClickedSaveMagnet({ alertId: aid(12) }))),
    ).toStrictEqual([])
  })

  test("a failure is reported and unlocks the alert", () => {
    const started = WatchDetail.update(
      loaded(plain),
      WatchDetail.Message.ClickedSaveMagnet({ alertId: aid(10) }),
    )
    const failed = WatchDetail.update(
      started.model,
      WatchDetail.Message.FailedSaveMagnet({ watchId: wid(1), alertId: aid(10), reason: "No key" }),
    )
    expect(WatchDetail.isAlertBusy(failed.model, aid(10))).toBe(false)
    expect(outTitle(failed)).toBe("Failed to save to AllDebrid")
  })

  test("a late answer from a previous watch doesn't touch the current one", () => {
    const model = loaded(plain)
    const late = WatchDetail.update(
      model,
      WatchDetail.Message.SucceededSaveMagnet({ watchId: wid(7), alertId: aid(10) }),
    )
    expect(names(late)).toStrictEqual([])
    expect(outTitle(late)).toBe("Saved to AllDebrid")
  })
})

describe("editing", () => {
  test("opens the form filled in with the watch", () => {
    const opened = WatchDetail.update(loaded(), WatchDetail.Message.ClickedEdit())
    expect(opened.model.form.mode).toStrictEqual({ _tag: "Edit", watchId: wid(1) })
    expect(opened.model.form.name).toBe("One Piece")
    expect(opened.model.form.dialog.isOpen).toBe(true)
  })

  test("moving to another watch closes a form left open for the first", () => {
    const editing = WatchDetail.update(loaded(), WatchDetail.Message.ClickedEdit()).model
    expect(editing.form.dialog.isOpen).toBe(true)
    const moved = WatchDetail.enter(editing, wid(2)).model
    expect(moved.form.dialog.isOpen).toBe(false)
    expect(moved.form.mode).toStrictEqual({ _tag: "Create" })
    expect(WatchDetail.enter(editing, wid(1)).model.form.dialog.isOpen).toBe(true)
  })

  test("is unavailable until the watch has loaded", () => {
    const loading = WatchDetail.enter(WatchDetail.init(), wid(1)).model
    expect(WatchDetail.update(loading, WatchDetail.Message.ClickedEdit()).model.form.name).toBe("")
  })

  test("a saved edit reloads the watch and says so", () => {
    const editing = WatchDetail.update(loaded(), WatchDetail.Message.ClickedEdit()).model
    const saved = WatchDetail.update(
      editing,
      WatchDetail.Message.GotFormMessage({ message: WatchForm.Message.SucceededSave() }),
    )
    expect(names(saved)).toContain("FetchWatch")
    expect(outTitle(saved)).toBe("Watch updated. Restart scheduled.")
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
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const path = (request: HttpClientRequest.HttpClientRequest) =>
    `${request.method} ${new URL(request.url).pathname}`

  test("fetching the watch and its alerts", async () => {
    expect(
      await run(WatchDetail.FetchWatch({ watchId: wid(1), seq: 4 }).effect, () => json(200, book)),
    ).toStrictEqual(
      WatchDetail.Message.SucceededFetchWatch({ watchId: wid(1), seq: 4, watch: book }),
    )
    expect(
      await run(WatchDetail.FetchAlerts({ watchId: wid(1), seq: 4 }).effect, () =>
        json(200, { alerts: [fresh] }),
      ),
    ).toStrictEqual(
      WatchDetail.Message.SucceededFetchAlerts({ watchId: wid(1), seq: 4, alerts: [fresh] }),
    )
    expect(
      await run(WatchDetail.FetchWatch({ watchId: wid(1), seq: 4 }).effect, () =>
        json(404, { _tag: "WatchNotFoundError", message: "No such watch" }),
      ),
    ).toStrictEqual(
      WatchDetail.Message.FailedFetchWatch({ watchId: wid(1), seq: 4, reason: "No such watch" }),
    )
  })

  test("acknowledging one and all hit the right endpoints", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      WatchDetail.AcknowledgeAlert({ watchId: wid(1), alertId: aid(10) }).effect,
      () => json(200, { success: true }),
      seen,
    )
    await run(
      WatchDetail.AcknowledgeAllAlerts({ watchId: wid(1) }).effect,
      () => json(200, { success: true }),
      seen,
    )
    expect(seen.map(path)).toStrictEqual([
      "POST /api/watches/1/alerts/10/acknowledge",
      "POST /api/watches/1/alerts/acknowledge-all",
    ])
  })

  test("download sends the alert to the folder, then marks it handled", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const result = await run(
      WatchDetail.DownloadAlert({ watchId: wid(1), alert: fresh, subfolder: "One%20Piece" }).effect,
      (request) =>
        request.url.endsWith("/download")
          ? json(200, { started: 1 })
          : json(200, { success: true }),
      seen,
    )
    expect(result).toStrictEqual(
      WatchDetail.Message.SucceededDownload({ watchId: wid(1), alertId: aid(10), started: 1 }),
    )
    expect(seen.map(path)).toStrictEqual([
      "POST /api/download",
      "POST /api/watches/1/alerts/10/acknowledge",
    ])
    expect(requestJson(seen[0])).toMatchObject({
      subfolder: "One%20Piece",
      items: [{ title: "Vol 100", guid: "guid-10", magnetUrl: "magnet:?xt=urn:btih:abc" }],
    })
  })

  test("a download that worked is a success even if marking it handled fails", async () => {
    const result = await run(
      WatchDetail.DownloadAlert({ watchId: wid(1), alert: fresh, subfolder: "x" }).effect,
      (request) =>
        request.url.endsWith("/download")
          ? json(200, { started: 1 })
          : json(500, { _tag: "WatchStoreError", message: "db down" }),
    )
    expect(result._tag).toBe("SucceededDownload")
  })

  test("a download that failed is not marked handled", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const result = await run(
      WatchDetail.DownloadAlert({ watchId: wid(1), alert: fresh, subfolder: "x" }).effect,
      () => json(500, { _tag: "WatchStoreError", message: "boom" }),
      seen,
    )
    expect(result._tag).toBe("FailedDownload")
    expect(seen).toHaveLength(1)
  })

  test("saving a magnet passes both links, then marks the alert handled", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const alert = makeAlert({ id: 10, magnetUrl: "magnet:?x", downloadUrl: "http://x/y.torrent" })
    const result = await run(
      WatchDetail.SaveAlertMagnet({ watchId: wid(1), alert }).effect,
      (request) =>
        request.url.endsWith("/save-magnet")
          ? json(200, { id: 1, ready: true })
          : json(200, { success: true }),
      seen,
    )
    expect(result._tag).toBe("SucceededSaveMagnet")
    expect(seen.map(path)).toStrictEqual([
      "POST /api/alldebrid/save-magnet",
      "POST /api/watches/1/alerts/10/acknowledge",
    ])
    expect(requestJson(seen[0])).toStrictEqual({
      magnetUrl: "magnet:?x",
      downloadUrl: "http://x/y.torrent",
    })
  })
})

const withPage = (page: WatchDetail.Model) => ({
  ...modelAt(AppRoute.WatchDetail({ watchId: 1 })),
  watchDetail: page,
})

describe("view", () => {
  test("shows the watch's details and its alerts", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(role("heading", { name: "One Piece" })).toExist(),
      sceneExpect(text("2 alerts")).toExist(),
      sceneExpect(text("Vol 100")).toExist(),
      sceneExpect(text("Vol 99")).toExist(),
      sceneExpect(text("(1 new)")).toExist(),
      sceneExpect(selector("[data-watch-summary]")).toContainText("Downloads to"),
      sceneExpect(selector("[data-watch-summary]")).toContainText("One Piece"),
      sceneExpect(selector("[data-filter-group='0']")).toContainText("color"),
    )
  })

  test("book watches offer Download; read alerts have no Acknowledge", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(selector("[data-alert='10'] [data-action='download']")).toExist(),
      sceneExpect(selector("[data-alert='10'] [data-action='acknowledge']")).toExist(),
      sceneExpect(selector("[data-alert='11'] [data-action='acknowledge']")).toBeAbsent(),
      sceneExpect(selector("[data-action='save-magnet']")).toBeAbsent(),
    )
  })

  test("non-book watches offer Save to Magnet, disabled when there's no link", () => {
    scene(
      { update, view },
      given(withPage(loaded(plain, [fresh, noLink]))),
      sceneExpect(text("Saves matches to AllDebrid")).toExist(),
      sceneExpect(selector("[data-alert='10'] [data-action='save-magnet']")).toBeEnabled(),
      sceneExpect(selector("[data-alert='12'] [data-action='save-magnet']")).toBeDisabled(),
      sceneExpect(selector("[data-action='download']")).toBeAbsent(),
    )
  })

  test("an in-flight alert has its buttons held", () => {
    const started = WatchDetail.update(
      loaded(),
      WatchDetail.Message.ClickedAcknowledge({ alertId: aid(10) }),
    ).model
    scene(
      { update, view },
      given(withPage(started)),
      sceneExpect(selector("[data-alert='10'] [data-action='download']")).toBeDisabled(),
      sceneExpect(selector("[data-alert='10'] [data-action='acknowledge']")).toBeDisabled(),
    )
  })

  test("Acknowledge All appears only while something is unread", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(role("button", { name: "Acknowledge All" })).toBeEnabled(),
    )
    scene(
      { update, view },
      given(withPage(loaded(book, [read]))),
      sceneExpect(role("button", { name: "Acknowledge All" })).toBeAbsent(),
    )
  })

  test("loading, empty and failed states", () => {
    scene(
      { update, view },
      given(withPage(WatchDetail.enter(WatchDetail.init(), wid(1)).model)),
      sceneExpect(text("Loading watch...")).toExist(),
      sceneExpect(text("Loading alerts...")).toExist(),
    )
    scene(
      { update, view },
      given(withPage(loaded(book, []))),
      sceneExpect(text("No alerts yet")).toExist(),
    )
    const failed = WatchDetail.update(
      WatchDetail.update(
        WatchDetail.enter(WatchDetail.init(), wid(1)).model,
        WatchDetail.Message.FailedFetchWatch({ watchId: wid(1), seq: 1, reason: "No such watch" }),
      ).model,
      WatchDetail.Message.FailedFetchAlerts({ watchId: wid(1), seq: 1, reason: "db down" }),
    ).model
    scene(
      { update, view },
      given(withPage(failed)),
      sceneExpect(text("Failed to load watch: No such watch")).toExist(),
      sceneExpect(text("Failed to load alerts: db down")).toExist(),
    )
  })

  test("Edit opens the form", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      click(role("button", { name: "Edit" })),
      Command.resolve(
        FolderSelect.FetchFolders,
        FolderSelect.Message.SucceededFetchFolders({ folders: [] }),
      ),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("dialog", { name: "Edit Watch" })).toExist(),
    )
  })

  test("the back link returns to the list", () => {
    scene(
      { update, view },
      given(withPage(loaded())),
      sceneExpect(selector("main a[href='/watches']")).toContainText("Back"),
    )
  })
})

describe("wiring", () => {
  const url = (path: string) => Option.getOrThrow(parseUrl(`http://localhost${path}`))
  const names2 = (path: string) => init(url(path)).commands?.map((c) => c.name) ?? []

  test("a cold load on /watches/3 loads that watch; elsewhere it doesn't", () => {
    expect(names2("/watches/3")).toStrictEqual(
      expect.arrayContaining(["FetchWatch", "FetchAlerts"]),
    )
    expect(names2("/watches")).not.toContain("FetchAlerts")
  })

  test("entering loads and activates; leaving deactivates", () => {
    const entered = update(
      modelAt(AppRoute.Watches()),
      Message.ChangedUrl({ url: url("/watches/3") }),
    )
    expect(entered.commands?.map((c) => c.name)).toStrictEqual(
      expect.arrayContaining(["FetchWatch", "FetchAlerts"]),
    )
    expect(entered.model.watchDetail.maybeWatchId).toStrictEqual(Option.some(wid(3)))
    expect(entered.model.watchDetail.isActive).toBe(true)
    expect(entered.model.watches.isActive).toBe(false)
    const left = update(entered.model, Message.ChangedUrl({ url: url("/watches") }))
    expect(left.model.watchDetail.isActive).toBe(false)
    expect(left.model.watches.isActive).toBe(true)
  })

  test("moving from one watch to another switches the page", () => {
    const first = update(
      modelAt(AppRoute.Watches()),
      Message.ChangedUrl({ url: url("/watches/3") }),
    )
    const second = update(first.model, Message.ChangedUrl({ url: url("/watches/4") }))
    expect(second.model.watchDetail.maybeWatchId).toStrictEqual(Option.some(wid(4)))
    expect(second.commands?.map((c) => c.name)).toStrictEqual(
      expect.arrayContaining(["FetchWatch"]),
    )
  })

  test.each([
    "/settings",
    "/latest",
    "/komga",
    "/convert",
    "/annas-archive",
    "/",
    "/debug",
    "/watches",
  ])("leaving a watch for %s stops its polling", (path) => {
    const model = {
      ...modelAt(AppRoute.WatchDetail({ watchId: 3 })),
      watchDetail: { ...WatchDetail.init(), isActive: true },
    }
    expect(update(model, Message.ChangedUrl({ url: url(path) })).model.watchDetail.isActive).toBe(
      false,
    )
  })

  test("actions that change alerts refresh the badge and show their toast", () => {
    const done = (message: WatchDetail.Message) =>
      update(
        modelAt(AppRoute.WatchDetail({ watchId: 1 })),
        Message.GotWatchDetailMessage({ message }),
      )
    const downloaded = done(
      WatchDetail.Message.SucceededDownload({ watchId: wid(1), alertId: aid(10), started: 1 }),
    )
    expect(downloaded.commands?.map((c) => c.name)).toContain("FetchUnreadCount")
    expect(downloaded.model.toasts.entries.map((e) => e.payload.title)).toStrictEqual([
      "Started 1 download",
    ])
    expect(
      done(
        WatchDetail.Message.SucceededAcknowledgeAll({ watchId: wid(1) }),
      ).model.toasts.entries.map((e) => e.payload.title),
    ).toStrictEqual(["All alerts acknowledged"])
    expect(
      done(
        WatchDetail.Message.SucceededSaveMagnet({ watchId: wid(1), alertId: aid(10) }),
      ).model.toasts.entries.map((e) => e.payload.title),
    ).toStrictEqual(["Saved to AllDebrid"])
  })

  test("acknowledging refreshes the sidebar's badge; toasts reach the toast host", () => {
    const acked = update(
      modelAt(AppRoute.WatchDetail({ watchId: 1 })),
      Message.GotWatchDetailMessage({
        message: WatchDetail.Message.SucceededAcknowledge({ watchId: wid(1), alertId: aid(10) }),
      }),
    )
    expect(acked.commands?.map((c) => c.name)).toContain("FetchUnreadCount")
    const failed = update(
      modelAt(AppRoute.WatchDetail({ watchId: 1 })),
      Message.GotWatchDetailMessage({
        message: WatchDetail.Message.FailedDownload({
          watchId: wid(1),
          alertId: aid(10),
          reason: "nope",
        }),
      }),
    )
    expect(failed.model.toasts.entries.map((e) => e.payload.title)).toStrictEqual([
      "Failed to start download",
    ])
  })

  test("a fractional id is not a watch page", () => {
    const model = update(
      modelAt(AppRoute.Watches()),
      Message.ChangedUrl({ url: url("/watches/1.5") }),
    )
    expect(model.model.route._tag).toBe("NotFound")
  })
})
