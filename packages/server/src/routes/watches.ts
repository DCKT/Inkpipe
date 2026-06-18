import { Effect } from "effect"
import { WatchStoreService } from "../layers/WatchStore"
import {
  type CreateWatchRequest,
  type UpdateWatchRequest,
  type Watch,
} from "@inkpipe/shared"

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
    const watch = yield* store.getWatch(id)
    return Response.json(watch satisfies Watch)
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
    return Response.json(watch satisfies Watch, { status: 201 })
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
    const watch = yield* store.updateWatch(id, body)
    return Response.json(watch satisfies Watch)
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const deleteWatchHandler = (id: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.deleteWatch(id)
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const listAlertsHandler = (watchId: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.getWatch(watchId)
    const alerts = yield* store.listAlerts(watchId)
    return Response.json({ alerts })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const acknowledgeAlertHandler = (watchId: string, alertId: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.acknowledgeAlert(watchId, alertId)
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 404 })),
    ),
  )

export const acknowledgeAllAlertsHandler = (watchId: string) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    yield* store.acknowledgeAllAlerts(watchId)
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
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
