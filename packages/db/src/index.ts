import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"

import migration_0001 from "./migrations/0001_initial"
import migration_0002 from "./migrations/0002_annas_archive"
import migration_0003 from "./migrations/0003_telegram"
import migration_0004 from "./migrations/0004_watch_subfolder"
import migration_0005 from "./migrations/0005_watch_alert_download_url"
import migration_0006 from "./migrations/0006_general_config"

const CONFIG_DIR = process.env.INKPIPE_DATA_DIR ?? join(homedir(), ".inkpipe")
export const DB_PATH = join(CONFIG_DIR, "inkpipe.db")

mkdirSync(CONFIG_DIR, { recursive: true })

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export const DbLayer = SqliteClient.layer({
  filename: DB_PATH,
  disableWAL: false,
  transformQueryNames: toSnakeCase,
  transformResultNames: toCamelCase,
})

export const runMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE IF NOT EXISTS effect_sql_migrations (
      migration_id INTEGER PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      name TEXT NOT NULL
    )
  `

  // `transformResultNames: toCamelCase` (see `DbLayer` above) rewrites every
  // returned row's keys, so `migration_id` comes back as `migrationId` — the
  // type here must match what the row actually looks like after that
  // transform, not the raw SQL column name.
  const applied = yield* sql<{ migrationId: number }>`
    SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id
  `
  const appliedIds = new Set(applied.map((r: { migrationId: number }) => r.migrationId))

  const migrations: Array<{ id: number; name: string; effect: typeof migration_0001 }> = [
    { id: 1, name: "0001_initial", effect: migration_0001 },
    { id: 2, name: "0002_annas_archive", effect: migration_0002 },
    { id: 3, name: "0003_telegram", effect: migration_0003 },
    { id: 4, name: "0004_watch_subfolder", effect: migration_0004 },
    { id: 5, name: "0005_watch_alert_download_url", effect: migration_0005 },
    { id: 6, name: "0006_general_config", effect: migration_0006 },
  ]

  for (const migration of migrations) {
    if (!appliedIds.has(migration.id)) {
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* migration.effect
          yield* sql`INSERT OR IGNORE INTO effect_sql_migrations (migration_id, name) VALUES (${migration.id}, ${migration.name})`
        }),
      )
    }
  }
})

export const DbMigratedLayer = Layer.mergeAll(
  DbLayer,
  Layer.effectDiscard(runMigrations).pipe(Layer.provide(DbLayer)),
)
