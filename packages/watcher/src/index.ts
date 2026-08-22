import { Effect, Layer, ManagedRuntime, Schedule } from "effect"
import { DbMigratedLayer } from "@inkpipe/db"
import { LogService, LogServiceLive } from "@inkpipe/server/layers/core/Log"
import { ConfigServiceLive } from "@inkpipe/server/layers/core/Config"
import {
  ProwlarrServiceLive,
  ProwlarrService,
} from "@inkpipe/server/layers/integrations/Prowlarr"
import {
  WatchStoreServiceLive,
  WatchStoreService,
} from "@inkpipe/server/layers/storage/WatchStore"
import { PushServiceLive } from "@inkpipe/server/layers/pipeline/Push"
import { TelegramServiceLive } from "@inkpipe/server/layers/integrations/Telegram"
import { notifyWatchMatches, type MatchedAlert } from "@inkpipe/server/layers/pipeline/WatchNotifier"
import { matchesFilter, type Watch } from "@inkpipe/shared"

const BaseLayer = Layer.mergeAll(
  DbMigratedLayer,
  Layer.provideMerge(PushServiceLive, LogServiceLive),
)
const ConfigLayer = Layer.provide(ConfigServiceLive, BaseLayer)
const WatchLayer = Layer.provide(WatchStoreServiceLive, BaseLayer)
const ProwlarrLayer = ProwlarrServiceLive.pipe(
  Layer.provide(ConfigLayer),
  Layer.provide(BaseLayer),
)
const TelegramLayer = TelegramServiceLive.pipe(
  Layer.provide(ConfigLayer),
  Layer.provide(BaseLayer),
)

const WatcherLayer = Layer.mergeAll(
  BaseLayer,
  ConfigLayer,
  WatchLayer,
  ProwlarrLayer,
  TelegramLayer,
)

function runWatch(watch: Watch) {
  return Effect.gen(function* () {
    const prowlarr = yield* ProwlarrService
    const store = yield* WatchStoreService
    const log = yield* LogService

    const results = yield* prowlarr
      .search(watch.query)
      .pipe(
        Effect.catch((e) =>
          log.error("watcher", `"${watch.name}": search failed`, e).pipe(
            Effect.as([] as any[]),
          ),
        ),
      )

    const matchedAlerts: MatchedAlert[] = []

    for (const result of results) {
      if (
        watch.filterGroups.length > 0 &&
        !matchesFilter(result.title, watch.filterGroups)
      )
        continue

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
      yield* log.info(`[watcher]`, `"${watch.name}": new match "${result.title}"`)
    }

    yield* notifyWatchMatches(watch, matchedAlerts)
  })
}

const app = Effect.gen(function* () {
  const store = yield* WatchStoreService
  const watches = yield* store.listEnabledWatches
  const log = yield* LogService

  if (watches.length === 0) {
    yield* log.info("[watcher]", "No enabled watches found")
    return
  }

  yield* log.info(`[watcher]`, `Starting ${watches.length} watches`)

  yield* Effect.forEach(watches, (watch) =>
    Effect.gen(function* () {
      const intervalMs = Math.max(watch.intervalSeconds * 1000, 300_000)
      yield* log.info(
        `[watcher]`,
        `"${watch.name}" scheduled every ${watch.intervalSeconds}s`,
      )
      yield* Effect.repeat(
        runWatch(watch).pipe(
          Effect.catch((e) =>
            log.error(`[watcher]`, `"${watch.name}": runtime error:`, e),
          ),
        ),
        Schedule.spaced(intervalMs),
      ).pipe(Effect.forkChild)
    }),
  )

  return yield* Effect.never
})

const runtime = ManagedRuntime.make(WatcherLayer)
runtime.runFork(app)

console.log("[watcher] Running. Press Ctrl+C to stop.")
