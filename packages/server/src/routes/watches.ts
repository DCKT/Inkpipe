import { Effect } from "effect"
import { WatchStoreService } from "../layers/WatchStore"
import { ProwlarrService } from "../layers/Prowlarr"
import { PushService } from "../layers/Push"
import { matchesFilter, WatchId, WatchAlertId } from "@inkpipe/shared"
import type { CreateWatchRequest, UpdateWatchRequest, Watch } from "@inkpipe/shared"

export const listWatchesHandler = Effect.gen(function* () {
  const store = yield* WatchStoreService
  const watches = yield* store.listWatches
  return Response.json({ watches })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
  ),
)

export const getWatchHandler = (id: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    const watch = yield* store.getWatch(WatchId.make(Number(id)))
    return Response.json(watch)
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const createWatchHandler = (body: CreateWatchRequest) =>
  Effect.gen(function* () {
    if (!body.name || !body.query || !body.intervalSeconds) {
      return Response.json({ error: "Missing required fields: name, query, intervalSeconds" }, { status: 400 })
    }
    if (body.intervalSeconds < 300) {
      return Response.json({ error: "intervalSeconds must be at least 300" }, { status: 400 })
    }
    const store = yield* WatchStoreService
    const watch = yield* store.createWatch({
      name: body.name,
      enabled: true,
      query: body.query,
      intervalSeconds: body.intervalSeconds,
      filterGroups: body.filterGroups ?? [],
    })
    return Response.json(watch, { status: 201 })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
    ),
  )

export const updateWatchHandler = (id: string, body: UpdateWatchRequest) =>
  Effect.gen(function* () {
    if (body.intervalSeconds !== undefined && body.intervalSeconds < 300) {
      return Response.json({ error: "intervalSeconds must be at least 300" }, { status: 400 })
    }
    const store = yield* WatchStoreService
    const watch = yield* store.updateWatch(WatchId.make(Number(id)), body as Partial<{ name: string; enabled: boolean; query: string; intervalSeconds: number; filterGroups: Watch["filterGroups"] }>)
    return Response.json(watch)
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const deleteWatchHandler = (id: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.deleteWatch(WatchId.make(Number(id)))
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const listAlertsHandler = (watchId: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    const wid = WatchId.make(Number(watchId))
    yield* store.getWatch(wid)
    const alerts = yield* store.listAlerts(wid)
    return Response.json({ alerts })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const acknowledgeAlertHandler = (watchId: string, alertId: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.acknowledgeAlert(WatchId.make(Number(watchId)), WatchAlertId.make(Number(alertId)))
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const acknowledgeAllAlertsHandler = (watchId: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.acknowledgeAllAlerts(WatchId.make(Number(watchId)))
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
    ),
  )

export const triggerWatchHandler = (id: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    const prowlarr = yield* ProwlarrService
    const push = yield* PushService

    const watch = yield* store.getWatch(WatchId.make(Number(id)))

    const results = yield* prowlarr.search(watch.query).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )

    let newAlerts = 0

    for (const result of results) {
      if (watch.filterGroups.length > 0 && !matchesFilter(result.title, watch.filterGroups)) continue

      const exists = yield* store.hasAlertForGuid(watch.id, result.guid)
      if (exists) continue

      yield* store.insertAlert({
        watchId: watch.id,
        guid: result.guid,
        title: result.title,
        magnetUrl: result.magnetUrl,
        size: result.size,
        seeders: result.seeders,
        indexer: result.indexer,
        matchedAt: Date.now(),
        acknowledged: false,
      })
      newAlerts++
    }

    if (newAlerts > 0) {
      yield* push.sendNotification({
        title: `Watch: ${watch.name}`,
        body: `${newAlerts} new match${newAlerts !== 1 ? "es" : ""} found`,
        tag: `watch-${watch.id}`,
      })
    }

    return Response.json({ matches: newAlerts })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const unreadCountHandler = Effect.gen(function* () {
  const store = yield* WatchStoreService
  const count = yield* store.getUnreadCount
  return Response.json({ count })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
  ),
)
