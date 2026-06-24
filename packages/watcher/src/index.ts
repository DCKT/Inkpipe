import { Effect, Layer, ManagedRuntime, Schedule } from "effect"
import { DbMigratedLayer } from "@inkpipe/db"
import { LogService, LogServiceLive } from "@inkpipe/server/layers/Log"
import { ConfigServiceLive } from "@inkpipe/server/layers/Config"
import {
  ProwlarrServiceLive,
  ProwlarrService,
} from "@inkpipe/server/layers/Prowlarr"
import {
  WatchStoreServiceLive,
  WatchStoreService,
} from "@inkpipe/server/layers/WatchStore"
import { PushServiceLive, PushService } from "@inkpipe/server/layers/Push"
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

const WatcherLayer = Layer.mergeAll(
  BaseLayer,
  ConfigLayer,
  WatchLayer,
  ProwlarrLayer,
)

function runWatch(watch: Watch) {
  return Effect.gen(function* () {
    const prowlarr = yield* ProwlarrService
    const store = yield* WatchStoreService
    const push = yield* PushService
    const log = yield* LogService

    let results
    try {
      results = yield* prowlarr
        .search(watch.query)
        .pipe(Effect.catchAll(() => Effect.succeed([] as any[])))
    } catch {
      log.error("watcher", `"${watch.name}": search failed`)
      return
    }

    let newAlerts = 0

    for (const result of results) {
      if (
        watch.filterGroups.length > 0 &&
        !matchesFilter(result.title, watch.filterGroups)
      )
        continue

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
      log.info(`[watcher]`, `"${watch.name}": new match "${result.title}"`)
    }

    if (newAlerts > 0) {
      yield* push.sendNotification({
        title: `Watch: ${watch.name}`,
        body: `${newAlerts} new match${newAlerts !== 1 ? "es" : ""} found`,
        tag: `watch-${watch.id}`,
      })
    }
  })
}

const app = Effect.gen(function* () {
  const store = yield* WatchStoreService
  const watches = yield* store.listEnabledWatches
  const log = yield* LogService

  if (watches.length === 0) {
    log.info("[watcher]", "No enabled watches found")
    return
  }

  log.info(`[watcher]`, `Starting ${watches.length} watches`)

  yield* Effect.forEach(watches, (watch) => {
    const intervalMs = Math.max(watch.intervalSeconds * 1000, 300_000)
    log.info(
      `[watcher]`,
      `"${watch.name}" scheduled every ${watch.intervalSeconds}s`,
    )
    return Effect.repeat(
      runWatch(watch).pipe(
        Effect.catchAll((e) =>
          Effect.sync(() => {
            log.error(`[watcher]`, `"${watch.name}": runtime error:`, e)
          }),
        ),
      ),
      Schedule.spaced(intervalMs),
    ).pipe(Effect.fork)
  })

  yield* Effect.never
})

const runtime = ManagedRuntime.make(WatcherLayer)
runtime.runFork(app)

console.log("[watcher] Running. Press Ctrl+C to stop.")
