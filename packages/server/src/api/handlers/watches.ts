import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { WatchStoreService } from "../../layers/storage/WatchStore"
import { ProwlarrService } from "../../layers/integrations/Prowlarr"
import { notifyWatchMatches, type MatchedAlert } from "../../layers/pipeline/WatchNotifier"
import { matchesFilter, WatchId, WatchAlertId, ValidationError } from "@inkpipe/shared"
import type { Watch } from "@inkpipe/shared"
import { InkpipeApi } from "@inkpipe/shared"

export const WatchesGroupLive = HttpApiBuilder.group(InkpipeApi, "watches", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        const watches = yield* store.listWatches
        return { watches }
      }))
    .handle("unreadCount", () =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        const count = yield* store.getUnreadCount
        return { count }
      }))
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        if (payload.intervalSeconds < 300) {
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
      }))
    .handle("get", ({ params }) =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        return yield* store.getWatch(WatchId.make(params.id))
      }))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function* () {
        if (payload.intervalSeconds !== undefined && payload.intervalSeconds < 300) {
          return yield* new ValidationError({ message: "intervalSeconds must be at least 300" })
        }
        const store = yield* WatchStoreService
        return yield* store.updateWatch(
          WatchId.make(params.id),
          payload as Partial<{ name: string; enabled: boolean; query: string; intervalSeconds: number; filterGroups: Watch["filterGroups"]; subfolder: string | null }>,
        )
      }))
    .handle("delete", ({ params }) =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        yield* store.deleteWatch(WatchId.make(params.id))
        return { success: true }
      }))
    .handle("listAlerts", ({ params }) =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        const wid = WatchId.make(params.id)
        yield* store.getWatch(wid)
        const alerts = yield* store.listAlerts(wid)
        return { alerts }
      }))
    .handle("acknowledgeAlert", ({ params }) =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        yield* store.acknowledgeAlert(WatchId.make(params.id), WatchAlertId.make(params.alertId))
        return { success: true }
      }))
    .handle("acknowledgeAllAlerts", ({ params }) =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        yield* store.acknowledgeAllAlerts(WatchId.make(params.id))
        return { success: true }
      }))
    .handle("trigger", ({ params }) =>
      Effect.gen(function* () {
        const store = yield* WatchStoreService
        const prowlarr = yield* ProwlarrService

        const watch = yield* store.getWatch(WatchId.make(params.id))

        const results = yield* prowlarr.search(watch.query).pipe(
          Effect.orElseSucceed(() => []),
        )

        const matchedAlerts: MatchedAlert[] = []

        for (const result of results) {
          if (watch.filterGroups.length > 0 && !matchesFilter(result.title, watch.filterGroups)) continue

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
          matchedAlerts.push({ id: alertId, title: result.title, indexer: result.indexer, seeders: result.seeders })
        }

        yield* notifyWatchMatches(watch, matchedAlerts)

        return { matches: matchedAlerts.length }
      })),
)
