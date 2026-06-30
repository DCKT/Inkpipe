import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"

import migration_0001 from "./migrations/0001_initial"

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

  const applied = yield* sql<{ migration_id: number }>`
    SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id
  `
  const appliedIds = new Set(applied.map((r: { migration_id: number }) => r.migration_id))

  const migrations: Array<{ id: number; name: string; effect: typeof migration_0001 }> = [
    { id: 1, name: "0001_initial", effect: migration_0001 },
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
