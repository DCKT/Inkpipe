import { Effect, Layer } from "effect"
import { type Watch, type WatchAlert, WatchStoreError, WatchNotFoundError } from "@inkpipe/shared"
import { DbService } from "@inkpipe/db"

export class WatchStoreService extends Effect.Tag("WatchStoreService")<
  WatchStoreService,
  {
    readonly listWatches: Effect.Effect<Watch[], WatchStoreError>
    readonly getWatch: (id: string) => Effect.Effect<Watch, WatchNotFoundError | WatchStoreError>
    readonly createWatch: (watch: Omit<Watch, "id">) => Effect.Effect<Watch, WatchStoreError>
    readonly updateWatch: (id: string, updates: Partial<Omit<Watch, "id">>) => Effect.Effect<Watch, WatchNotFoundError | WatchStoreError>
    readonly deleteWatch: (id: string) => Effect.Effect<void, WatchNotFoundError | WatchStoreError>
    readonly listAlerts: (watchId: string) => Effect.Effect<WatchAlert[], WatchStoreError>
    readonly getAlert: (watchId: string, alertId: string) => Effect.Effect<WatchAlert, WatchNotFoundError | WatchStoreError>
    readonly acknowledgeAlert: (watchId: string, alertId: string) => Effect.Effect<void, WatchNotFoundError | WatchStoreError>
    readonly acknowledgeAllAlerts: (watchId: string) => Effect.Effect<void, WatchStoreError>
    readonly insertAlert: (alert: WatchAlert) => Effect.Effect<void, WatchStoreError>
    readonly hasAlertForGuid: (watchId: string, guid: string) => Effect.Effect<boolean, WatchStoreError>
    readonly getUnreadCount: Effect.Effect<number, WatchStoreError>
  }
>() {}

let nextWatchId = 1

function rowToWatch(row: Record<string, unknown>): Watch {
  return {
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    query: String(row.query),
    intervalSeconds: Number(row.interval_seconds),
    filterGroups: JSON.parse(String(row.filter_groups)) as Watch["filterGroups"],
  }
}

function rowToAlert(row: Record<string, unknown>): WatchAlert {
  return {
    id: String(row.id),
    watchId: String(row.watch_id),
    guid: String(row.guid),
    title: String(row.title),
    magnetUrl: row.magnet_url ? String(row.magnet_url) : null,
    size: Number(row.size),
    seeders: Number(row.seeders),
    indexer: String(row.indexer),
    matchedAt: Number(row.matched_at),
    acknowledged: Boolean(row.acknowledged),
  }
}

export const WatchStoreServiceLive = Layer.effect(
  WatchStoreService,
  Effect.gen(function* () {
    const { db } = yield* DbService

    const listWatches = Effect.try({
      try: () => {
        const rows = db.query("SELECT * FROM watches ORDER BY name").all() as Record<string, unknown>[]
        return rows.map(rowToWatch)
      },
      catch: (e) => new WatchStoreError({ message: `Failed to list watches: ${String(e)}` }),
    })

    const getWatch = (id: string) =>
      Effect.try({
        try: () => {
          const row = db.query("SELECT * FROM watches WHERE id = ?").get(id) as Record<string, unknown> | undefined
          if (!row) throw new WatchNotFoundError({ message: `Watch ${id} not found` })
          return rowToWatch(row)
        },
        catch: (e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to get watch ${id}: ${String(e)}` })
        },
      })

    const createWatch = (input: Omit<Watch, "id">) =>
      Effect.try({
        try: () => {
          const id = String(nextWatchId++)
          const watch: Watch = { id, ...input }
          db.prepare(
            "INSERT INTO watches (id, name, enabled, query, interval_seconds, filter_groups) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(watch.id, watch.name, watch.enabled ? 1 : 0, watch.query, watch.intervalSeconds, JSON.stringify(watch.filterGroups))
          return watch
        },
        catch: (e) => new WatchStoreError({ message: `Failed to create watch: ${String(e)}` }),
      })

    const updateWatch = (id: string, updates: Partial<Omit<Watch, "id">>) =>
      Effect.gen(function* () {
        const existing = yield* getWatch(id)
        const merged: Watch = {
          ...existing,
          ...updates,
          filterGroups: updates.filterGroups ?? existing.filterGroups,
        }
        yield* Effect.try({
          try: () => {
            db.prepare(
              "UPDATE watches SET name = ?, enabled = ?, query = ?, interval_seconds = ?, filter_groups = ? WHERE id = ?",
            ).run(merged.name, merged.enabled ? 1 : 0, merged.query, merged.intervalSeconds, JSON.stringify(merged.filterGroups), id)
          },
          catch: (e) => new WatchStoreError({ message: `Failed to update watch ${id}: ${String(e)}` }),
        })
        return merged
      })

    const deleteWatch = (id: string) =>
      Effect.gen(function* () {
        yield* getWatch(id)
        yield* Effect.try({
          try: () => {
            db.transaction(() => {
              db.prepare("DELETE FROM watch_alerts WHERE watch_id = ?").run(id)
              db.prepare("DELETE FROM watches WHERE id = ?").run(id)
            })()
          },
          catch: (e) => new WatchStoreError({ message: `Failed to delete watch ${id}: ${String(e)}` }),
        })
      })

    const listAlerts = (watchId: string) =>
      Effect.try({
        try: () => {
          const rows = db
            .query("SELECT * FROM watch_alerts WHERE watch_id = ? ORDER BY matched_at DESC")
            .all(watchId) as Record<string, unknown>[]
          return rows.map(rowToAlert)
        },
        catch: (e) => new WatchStoreError({ message: `Failed to list alerts: ${String(e)}` }),
      })

    const getAlert = (watchId: string, alertId: string) =>
      Effect.try({
        try: () => {
          const row = db
            .query("SELECT * FROM watch_alerts WHERE watch_id = ? AND id = ?")
            .get(watchId, alertId) as Record<string, unknown> | undefined
          if (!row) throw new WatchNotFoundError({ message: `Alert ${alertId} not found` })
          return rowToAlert(row)
        },
        catch: (e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to get alert: ${String(e)}` })
        },
      })

    const acknowledgeAlert = (watchId: string, alertId: string) =>
      Effect.gen(function* () {
        yield* getAlert(watchId, alertId)
        yield* Effect.try({
          try: () => {
            db.prepare("UPDATE watch_alerts SET acknowledged = 1 WHERE watch_id = ? AND id = ?").run(watchId, alertId)
          },
          catch: (e) => new WatchStoreError({ message: `Failed to acknowledge alert: ${String(e)}` }),
        })
      })

    const acknowledgeAllAlerts = (watchId: string) =>
      Effect.try({
        try: () => {
          db.prepare("UPDATE watch_alerts SET acknowledged = 1 WHERE watch_id = ? AND acknowledged = 0").run(watchId)
        },
        catch: (e) => new WatchStoreError({ message: `Failed to acknowledge alerts: ${String(e)}` }),
      })

    const insertAlert = (alert: WatchAlert) =>
      Effect.try({
        try: () => {
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
        },
        catch: (e) => new WatchStoreError({ message: `Failed to insert alert: ${String(e)}` }),
      })

    const hasAlertForGuid = (watchId: string, guid: string) =>
      Effect.try({
        try: () => {
          const row = db
            .query("SELECT 1 FROM watch_alerts WHERE watch_id = ? AND guid = ?")
            .get(watchId, guid)
          return row !== null
        },
        catch: (e) => new WatchStoreError({ message: `Failed to check alert: ${String(e)}` }),
      })

    const getUnreadCount = Effect.try({
      try: () => {
        const row = db.query("SELECT COUNT(*) as count FROM watch_alerts WHERE acknowledged = 0").get() as { count: number }
        return row.count
      },
      catch: (e) => new WatchStoreError({ message: `Failed to get unread count: ${String(e)}` }),
    })

    return {
      listWatches,
      getWatch,
      createWatch,
      updateWatch,
      deleteWatch,
      listAlerts,
      getAlert,
      acknowledgeAlert,
      acknowledgeAllAlerts,
      insertAlert,
      hasAlertForGuid,
      getUnreadCount,
    }
  }),
)
