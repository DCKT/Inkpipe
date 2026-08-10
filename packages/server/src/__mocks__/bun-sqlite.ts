// `bun:sqlite` isn't resolvable under `vitest run` (it runs on Node's ESM
// loader, not Bun's — confirmed by trying to import it directly: "Only URLs
// with a scheme in: file, data, and node are supported"). vitest.config.ts
// aliases `bun:sqlite` to this file so `@effect/sql-sqlite-bun`'s driver gets
// something that behaves like it.
//
// This is a thin adapter onto Node's built-in `node:sqlite` (a real SQLite
// engine, stable since Node 22.5) rather than a hand-rolled SQL emulator —
// the previous version of this file regex-parsed raw SQL text and never
// implemented WHERE filtering, UPDATE, or RETURNING, silently no-op'ing any
// write the real @effect/sql-sqlite-bun driver issues (it always calls
// `.query(sql).all(...params)`, even for INSERT/UPDATE/DELETE — never
// `.run()`). A real engine is both less code and actually correct.
import { DatabaseSync } from "node:sqlite"

interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

interface QueryResult {
  all: (...params: unknown[]) => Record<string, unknown>[]
  values: (...params: unknown[]) => unknown[][]
  get: (...params: unknown[]) => Record<string, unknown> | undefined
}

class Database {
  private db: DatabaseSync

  constructor(filename: string, options?: { readonly?: boolean; readwrite?: boolean; create?: boolean }) {
    this.db = new DatabaseSync(filename, { readOnly: options?.readonly ?? false })
  }

  run(sql: string, ...params: unknown[]): RunResult {
    if (params.length === 0) {
      // PRAGMA / DDL statements the real driver fires via db.run(sql) with no params.
      this.db.exec(sql)
      return { changes: 0, lastInsertRowid: 0 }
    }
    const result = this.db.prepare(sql).run(...(params as never[]))
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid }
  }

  query(sql: string): QueryResult & { safeIntegers: (enabled: boolean) => void } {
    const stmt = this.db.prepare(sql)
    return {
      all: (...params: unknown[]) => stmt.all(...(params as never[])) as Record<string, unknown>[],
      get: (...params: unknown[]) => stmt.get(...(params as never[])) as Record<string, unknown> | undefined,
      values: (...params: unknown[]) =>
        (stmt.all(...(params as never[])) as Record<string, unknown>[]).map((row) => Object.values(row)),
      // bun:sqlite's `Statement#safeIntegers` toggles bigint-vs-number for integer
      // columns; the real driver always calls it. node:sqlite always returns plain
      // numbers within the safe range (fine for this codebase's ids/timestamps), so
      // it's a no-op here.
      safeIntegers: (_enabled: boolean) => {},
    }
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql)
    return {
      run: (...params: unknown[]) => this.run(sql, ...params),
      all: (...params: unknown[]) => stmt.all(...(params as never[])),
      get: (...params: unknown[]) => stmt.get(...(params as never[])),
      values: (...params: unknown[]) => this.query(sql).values(...params),
    }
  }

  close() {
    this.db.close()
  }

  serialize(): Uint8Array {
    // node:sqlite's DatabaseSync has no equivalent; not exercised by any
    // code path this mock is used against (no test calls SqlClient's export).
    throw new Error("Database.serialize() is not supported by the node:sqlite-backed test double")
  }

  loadExtension(_path: string) {
    // Not needed by any code path this mock is exercised against.
  }

  transaction(fn: () => void): () => void {
    return fn
  }
}

export { Database }
