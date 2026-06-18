import { getDb, loadProwlarrConfig } from "./config"
import { listEnabledWatches, hasAlertForGuid, insertAlert } from "./store"
import { searchProwlarr } from "./prowlarr"
import { sendPushNotification } from "./push"
import type { Watch, WatchAlert } from "@inkpipe/shared"

const db = getDb()

function matchesFilter(title: string, groups: Watch["filterGroups"]): boolean {
  const lowerTitle = title.toLowerCase()
  for (const group of groups) {
    const matches = group.substrings.map((s) => lowerTitle.includes(s.toLowerCase()))
    if (group.mode === "AND") {
      if (!matches.every(Boolean)) return false
    } else {
      if (!matches.some(Boolean)) return false
    }
  }
  return true
}

async function runWatch(watch: Watch): Promise<number> {
  const prowlarrConfig = loadProwlarrConfig(db)
  if (!prowlarrConfig) {
    console.log(`[watcher] "${watch.name}": Prowlarr not configured, skipping`)
    return 0
  }

  let results
  try {
    results = (await searchProwlarr(prowlarrConfig, watch.query)).slice(0, 50)
  } catch (err) {
    console.error(`[watcher] "${watch.name}": search failed:`, err instanceof Error ? err.message : err)
    return 0
  }

  let newAlerts = 0
  let alertIdCounter = Date.now()

  for (const result of results) {
    if (watch.filterGroups.length > 0 && !matchesFilter(result.title, watch.filterGroups)) continue

    if (hasAlertForGuid(db, watch.id, result.guid)) continue

    const alert: WatchAlert = {
      id: String(alertIdCounter++),
      watchId: watch.id,
      guid: result.guid,
      title: result.title,
      magnetUrl: result.magnetUrl,
      size: result.size,
      seeders: result.seeders,
      indexer: result.indexer,
      matchedAt: Date.now(),
      acknowledged: false,
    }
    insertAlert(db, alert)
    newAlerts++
    console.log(`[watcher] "${watch.name}": new match "${result.title}"`)
  }

  return newAlerts
}

function start() {
  const watches = listEnabledWatches(db)

  if (watches.length === 0) {
    console.log("[watcher] No enabled watches found")
    return
  }

  console.log(`[watcher] Starting ${watches.length} watches`)

  for (const watch of watches) {
    const intervalMs = Math.max(watch.intervalSeconds * 1000, 300_000)

    const run = async () => {
      console.log(`[watcher] "${watch.name}": running...`)
      try {
        const newAlerts = await runWatch(watch)
        if (newAlerts > 0) {
          sendPushNotification({
            title: `Watch: ${watch.name}`,
            body: `${newAlerts} new match${newAlerts !== 1 ? "es" : ""} found`,
            tag: `watch-${watch.id}`,
          })
        }
      } catch (err) {
        console.error(`[watcher] "${watch.name}": runtime error:`, err)
      }
    }

    run()
    setInterval(run, intervalMs)
    console.log(`[watcher] "${watch.name}" scheduled every ${watch.intervalSeconds}s`)
  }
}

start()

console.log("[watcher] Running. Press Ctrl+C to stop.")
