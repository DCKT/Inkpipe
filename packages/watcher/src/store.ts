import { Database } from "bun:sqlite"
import type { Watch, WatchAlert } from "@inkpipe/shared"

export function listEnabledWatches(db: Database): Watch[] {
  const rows = db.query("SELECT * FROM watches WHERE enabled = 1 ORDER BY name").all() as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    query: String(row.query),
    intervalSeconds: Number(row.interval_seconds),
    filterGroups: JSON.parse(String(row.filter_groups)) as Watch["filterGroups"],
  }))
}

export function hasAlertForGuid(db: Database, watchId: string, guid: string): boolean {
  const row = db.query("SELECT 1 FROM watch_alerts WHERE watch_id = ? AND guid = ?").get(watchId, guid)
  return row !== null
}

export function insertAlert(db: Database, alert: WatchAlert): void {
  db.prepare(
    "INSERT OR IGNORE INTO watch_alerts (id, watch_id, guid, title, magnet_url, size, seeders, indexer, matched_at, acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    alert.id,
    alert.watchId,
    alert.guid,
    alert.title,
    alert.magnetUrl,
    alert.size,
    alert.seeders,
    alert.indexer,
    alert.matchedAt,
    alert.acknowledged ? 1 : 0,
  )
}
