import { implement } from "@inkpipe/capability/implement"
import {
  ValidationError,
  WatchAlertId,
  WatchId,
  acknowledgeAlertContract,
  acknowledgeAllAlertsContract,
  createWatchContract,
  deleteWatchContract,
  getUnreadCountContract,
  getWatchContract,
  listWatchAlertsContract,
  listWatchesContract,
  matchesFilter,
  triggerWatchContract,
  updateWatchContract,
} from "@inkpipe/shared"
import { Effect } from "effect"
import { ProwlarrService } from "../layers/integrations/Prowlarr"
import { notifyWatchMatches } from "../layers/pipeline/WatchNotifier"
import type { MatchedAlert } from "../layers/pipeline/WatchNotifier"
import { WatchStoreService } from "../layers/storage/WatchStore"

const MIN_INTERVAL_SECONDS = 300

export const listWatches = implement(listWatchesContract, () =>
  WatchStoreService.use((store) => store.listWatches).pipe(Effect.map((watches) => ({ watches }))),
)

export const getUnreadCount = implement(getUnreadCountContract, () =>
  WatchStoreService.use((store) => store.getUnreadCount).pipe(Effect.map((count) => ({ count }))),
)

export const createWatch = implement(createWatchContract, (payload) =>
  Effect.gen(function* () {
    if (payload.intervalSeconds < MIN_INTERVAL_SECONDS) {
      return yield* new ValidationError({ message: "intervalSeconds must be at least 300" })
    }
    const store = yield* WatchStoreService
    return yield* store.createWatch({
      name: payload.name,
      enabled: true,
      query: payload.query,
      intervalSeconds: payload.intervalSeconds,
      filterGroups: payload.filterGroups ?? [],
      subfolder: payload.subfolder ?? null,
    })
  }),
)

export const getWatch = implement(getWatchContract, ({ id }) =>
  WatchStoreService.use((store) => store.getWatch(WatchId.make(id))),
)

export const updateWatch = implement(updateWatchContract, ({ id, ...changes }) =>
  Effect.gen(function* () {
    if (changes.intervalSeconds !== undefined && changes.intervalSeconds < MIN_INTERVAL_SECONDS) {
      return yield* new ValidationError({ message: "intervalSeconds must be at least 300" })
    }
    const store = yield* WatchStoreService
    return yield* store.updateWatch(WatchId.make(id), changes)
  }),
)

export const deleteWatch = implement(deleteWatchContract, ({ id }) =>
  WatchStoreService.use((store) => store.deleteWatch(WatchId.make(id))).pipe(
    Effect.as({ success: true }),
  ),
)

export const listWatchAlerts = implement(listWatchAlertsContract, ({ id }) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    const watchId = WatchId.make(id)
    yield* store.getWatch(watchId)
    const alerts = yield* store.listAlerts(watchId)
    return { alerts }
  }),
)

export const acknowledgeAlert = implement(acknowledgeAlertContract, ({ id, alertId }) =>
  WatchStoreService.use((store) =>
    store.acknowledgeAlert(WatchId.make(id), WatchAlertId.make(alertId)),
  ).pipe(Effect.as({ success: true })),
)

export const acknowledgeAllAlerts = implement(acknowledgeAllAlertsContract, ({ id }) =>
  WatchStoreService.use((store) => store.acknowledgeAllAlerts(WatchId.make(id))).pipe(
    Effect.as({ success: true }),
  ),
)

export const triggerWatch = implement(triggerWatchContract, ({ id }) =>
  Effect.gen(function* () {
    const store = yield* WatchStoreService
    const prowlarr = yield* ProwlarrService

    const watch = yield* store.getWatch(WatchId.make(id))
    const results = yield* prowlarr.search(watch.query).pipe(Effect.orElseSucceed(() => []))

    const matchedAlerts: MatchedAlert[] = []

    for (const result of results) {
      if (watch.filterGroups.length > 0 && !matchesFilter(result.title, watch.filterGroups)) {
        continue
      }

      const exists = yield* store.hasAlertForGuid(watch.id, result.guid)
      if (exists) continue

      const alertId = yield* store.insertAlert({
        watchId: watch.id,
        guid: result.guid,
        title: result.title,
        magnetUrl: result.magnetUrl,
        downloadUrl: result.downloadUrl,
        size: result.size,
        seeders: result.seeders,
        indexer: result.indexer,
        matchedAt: Date.now(),
        acknowledged: false,
      })
      matchedAlerts.push({
        id: alertId,
        title: result.title,
        indexer: result.indexer,
        seeders: result.seeders,
      })
    }

    yield* notifyWatchMatches(watch, matchedAlerts)

    return { matches: matchedAlerts.length }
  }),
)

export const watchesCapabilities = [
  listWatches,
  getUnreadCount,
  createWatch,
  getWatch,
  updateWatch,
  deleteWatch,
  listWatchAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  triggerWatch,
] as const
