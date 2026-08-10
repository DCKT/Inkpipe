// Shared test helper: a fresh, isolated, fully-migrated in-memory SQLite
// layer for tests that exercise real SQL-backed services (JobStore,
// WatchStore, Config) instead of mocking SqlClient.SqlClient by hand.
// `:memory:` + a fresh SqliteClient.layer() call per invocation means each
// test gets its own database — no shared state leaking between tests.
import { Layer } from "effect"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { runMigrations } from "@inkpipe/db"

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function makeTestDbLayer() {
  const InMemoryDb = SqliteClient.layer({
    filename: ":memory:",
    disableWAL: true,
    transformQueryNames: toSnakeCase,
    transformResultNames: toCamelCase,
  })
  return Layer.mergeAll(
    InMemoryDb,
    Layer.effectDiscard(runMigrations).pipe(Layer.provide(InMemoryDb)),
  )
}
