import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { type Watch, type WatchAlert, type WatchWithUnread, WatchStoreError, WatchNotFoundError } from "@inkpipe/shared"
import { WatchId, WatchAlertId } from "@inkpipe/shared"

export type { WatchWithUnread }

export class WatchStoreService extends Effect.Tag("WatchStoreService")<
  WatchStoreService,
  {
    readonly listWatches: Effect.Effect<WatchWithUnread[], WatchStoreError>
    readonly listEnabledWatches: Effect.Effect<Watch[], WatchStoreError>
    readonly getWatch: (id: WatchId) => Effect.Effect<Watch, WatchNotFoundError | WatchStoreError>
    readonly createWatch: (input: { name: string; enabled: boolean; query: string; intervalSeconds: number; filterGroups: Watch["filterGroups"] }) => Effect.Effect<Watch, WatchStoreError>
    readonly updateWatch: (id: WatchId, updates: Partial<{ name: string; enabled: boolean; query: string; intervalSeconds: number; filterGroups: Watch["filterGroups"] }>) => Effect.Effect<Watch, WatchNotFoundError | WatchStoreError>
    readonly deleteWatch: (id: WatchId) => Effect.Effect<void, WatchNotFoundError | WatchStoreError>
    readonly listAlerts: (watchId: WatchId) => Effect.Effect<WatchAlert[], WatchStoreError>
    readonly getAlert: (watchId: WatchId, alertId: WatchAlertId) => Effect.Effect<WatchAlert, WatchNotFoundError | WatchStoreError>
    readonly acknowledgeAlert: (watchId: WatchId, alertId: WatchAlertId) => Effect.Effect<void, WatchNotFoundError | WatchStoreError>
    readonly acknowledgeAllAlerts: (watchId: WatchId) => Effect.Effect<void, WatchStoreError>
    readonly insertAlert: (alert: { watchId: WatchId; guid: string; title: string; magnetUrl: string | null; size: number; seeders: number; indexer: string; matchedAt: number; acknowledged: boolean }) => Effect.Effect<void, WatchStoreError>
    readonly hasAlertForGuid: (watchId: WatchId, guid: string) => Effect.Effect<boolean, WatchStoreError>
    readonly getUnreadCount: Effect.Effect<number, WatchStoreError>
  }
>() {}

interface WatchRow {
  id: number
  name: string
  enabled: number
  query: string
  intervalSeconds: number
  filterGroups: string
  createdAt: string
  updatedAt: string
}

function toWatch(row: WatchRow): Watch {
  return {
    id: WatchId.make(row.id),
    name: row.name,
    enabled: Boolean(row.enabled),
    query: row.query,
    intervalSeconds: row.intervalSeconds,
    filterGroups: JSON.parse(row.filterGroups) as Watch["filterGroups"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

interface WatchWithUnreadRow extends WatchRow {
  unreadCount: number
}

function toWatchWithUnread(row: WatchWithUnreadRow): WatchWithUnread {
  const watch = toWatch(row)
  return { ...watch, unreadCount: row.unreadCount }
}

interface AlertRow {
  id: number
  watchId: number
  guid: string
  title: string
  magnetUrl: string | null
  size: number
  seeders: number
  indexer: string
  matchedAt: number
  acknowledged: number
}

function toAlert(row: AlertRow): WatchAlert {
  return {
    id: WatchAlertId.make(row.id),
    watchId: WatchId.make(row.watchId),
    guid: row.guid,
    title: row.title,
    magnetUrl: row.magnetUrl,
    size: row.size,
    seeders: row.seeders,
    indexer: row.indexer,
    matchedAt: row.matchedAt,
    acknowledged: Boolean(row.acknowledged),
  }
}

export const WatchStoreServiceLive = Layer.effect(
  WatchStoreService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const listWatches = Effect.gen(function* () {
      const rows = yield* sql<WatchWithUnreadRow>`
        SELECT w.*, COALESCE(a.unread, 0) AS unread_count
        FROM watches w
        LEFT JOIN (
          SELECT watch_id, COUNT(*) AS unread
          FROM watch_alerts
          WHERE acknowledged = 0
          GROUP BY watch_id
        ) a ON a.watch_id = w.id
        ORDER BY w.name
      `
      return rows.map(toWatchWithUnread)
    }).pipe(
      Effect.mapError((e) => new WatchStoreError({ message: `Failed to list watches: ${String(e)}` })),
    )

    const listEnabledWatches = Effect.gen(function* () {
      const rows = yield* sql<WatchRow>`SELECT * FROM watches WHERE enabled = 1 ORDER BY name`
      return rows.map(toWatch)
    }).pipe(
      Effect.mapError((e) => new WatchStoreError({ message: `Failed to list enabled watches: ${String(e)}` })),
    )

    const getWatch = (id: WatchId) =>
      Effect.gen(function* () {
        const rows = yield* sql<WatchRow>`SELECT * FROM watches WHERE id = ${id}`
        if (rows.length === 0) {
          return yield* Effect.fail(new WatchNotFoundError({ message: `Watch ${id} not found` }))
        }
        return toWatch(rows[0])
      }).pipe(
        Effect.mapError((e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to get watch ${id}: ${String(e)}` })
        }),
      )

    const createWatch = (input: { name: string; enabled: boolean; query: string; intervalSeconds: number; filterGroups: Watch["filterGroups"] }) =>
      Effect.gen(function* () {
        const dbInput = {
          name: input.name,
          enabled: input.enabled ? 1 : 0,
          query: input.query,
          intervalSeconds: input.intervalSeconds,
          filterGroups: JSON.stringify(input.filterGroups),
        }
        const rows = yield* sql<WatchRow>`INSERT INTO watches ${sql.insert(dbInput).returning("*")}`
        return toWatch(rows[0])
      }).pipe(
        Effect.mapError((e) => new WatchStoreError({ message: `Failed to create watch: ${String(e)}` })),
      )

    const updateWatch = (id: WatchId, updates: Partial<{ name: string; enabled: boolean; query: string; intervalSeconds: number; filterGroups: Watch["filterGroups"] }>) =>
      Effect.gen(function* () {
        yield* getWatch(id)
        const dbUpdate: Record<string, unknown> = {}
        if (updates.name !== undefined) dbUpdate.name = updates.name
        if (updates.enabled !== undefined) dbUpdate.enabled = updates.enabled ? 1 : 0
        if (updates.query !== undefined) dbUpdate.query = updates.query
        if (updates.intervalSeconds !== undefined) dbUpdate.intervalSeconds = updates.intervalSeconds
        if (updates.filterGroups !== undefined) dbUpdate.filterGroups = JSON.stringify(updates.filterGroups)
        if (Object.keys(dbUpdate).length > 0) {
          const rows = yield* sql<WatchRow>`UPDATE watches SET ${sql.update(dbUpdate, ["id"])} WHERE id = ${id} returning *`
          return toWatch(rows[0])
        }
        return yield* getWatch(id)
      }).pipe(
        Effect.mapError((e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to update watch ${id}: ${String(e)}` })
        }),
      )

    const deleteWatch = (id: WatchId) =>
      Effect.gen(function* () {
        yield* getWatch(id)
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM watch_alerts WHERE watch_id = ${id}`
            yield* sql`DELETE FROM watches WHERE id = ${id}`
          }),
        )
      }).pipe(
        Effect.mapError((e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to delete watch ${id}: ${String(e)}` })
        }),
      )

    const listAlerts = (watchId: WatchId) =>
      Effect.gen(function* () {
        const rows = yield* sql<AlertRow>`SELECT * FROM watch_alerts WHERE watch_id = ${watchId} ORDER BY matched_at DESC`
        return rows.map(toAlert)
      }).pipe(
        Effect.mapError((e) => new WatchStoreError({ message: `Failed to list alerts: ${String(e)}` })),
      )

    const getAlert = (watchId: WatchId, alertId: WatchAlertId) =>
      Effect.gen(function* () {
        const rows = yield* sql<AlertRow>`SELECT * FROM watch_alerts WHERE watch_id = ${watchId} AND id = ${alertId}`
        if (rows.length === 0) {
          return yield* Effect.fail(new WatchNotFoundError({ message: `Alert ${alertId} not found` }))
        }
        return toAlert(rows[0])
      }).pipe(
        Effect.mapError((e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to get alert: ${String(e)}` })
        }),
      )

    const acknowledgeAlert = (watchId: WatchId, alertId: WatchAlertId) =>
      Effect.gen(function* () {
        yield* getAlert(watchId, alertId)
        yield* sql`UPDATE watch_alerts SET acknowledged = 1 WHERE watch_id = ${watchId} AND id = ${alertId}`
      }).pipe(
        Effect.mapError((e) => {
          if (e instanceof WatchNotFoundError) return e
          return new WatchStoreError({ message: `Failed to acknowledge alert: ${String(e)}` })
        }),
      )

    const acknowledgeAllAlerts = (watchId: WatchId) =>
      Effect.gen(function* () {
        yield* sql`UPDATE watch_alerts SET acknowledged = 1 WHERE watch_id = ${watchId} AND acknowledged = 0`
      }).pipe(
        Effect.mapError((e) => new WatchStoreError({ message: `Failed to acknowledge alerts: ${String(e)}` })),
      )

    const insertAlert = (alert: { watchId: WatchId; guid: string; title: string; magnetUrl: string | null; size: number; seeders: number; indexer: string; matchedAt: number; acknowledged: boolean }) =>
      Effect.gen(function* () {
        yield* sql`INSERT OR IGNORE INTO watch_alerts ${sql.insert({
          watchId: alert.watchId,
          guid: alert.guid,
          title: alert.title,
          magnetUrl: alert.magnetUrl,
          size: alert.size,
          seeders: alert.seeders,
          indexer: alert.indexer,
          matchedAt: alert.matchedAt,
          acknowledged: alert.acknowledged ? 1 : 0,
        })}`
      }).pipe(
        Effect.mapError((e) => new WatchStoreError({ message: `Failed to insert alert: ${String(e)}` })),
      )

    const hasAlertForGuid = (watchId: WatchId, guid: string) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ x: number }>`SELECT 1 as x FROM watch_alerts WHERE watch_id = ${watchId} AND guid = ${guid}`
        return rows.length > 0
      }).pipe(
        Effect.mapError((e) => new WatchStoreError({ message: `Failed to check alert: ${String(e)}` })),
      )

    const getUnreadCount = Effect.gen(function* () {
      const rows = yield* sql<{ count: number }>`SELECT COUNT(*) as count FROM watch_alerts WHERE acknowledged = 0`
      return rows[0]?.count ?? 0
    }).pipe(
      Effect.mapError((e) => new WatchStoreError({ message: `Failed to get unread count: ${String(e)}` })),
    )

    return {
      listWatches,
      listEnabledWatches,
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
