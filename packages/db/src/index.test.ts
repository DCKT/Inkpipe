import { describe, it, expect, beforeEach } from "vitest"
import { Effect } from "effect"
import { getDb, DbService, DbServiceLive } from "./index"
import { resetMockDb } from "./__mocks__/bun-sqlite"

beforeEach(() => {
  resetMockDb()
})

describe("DbService", () => {
  it("getDb returns a Database instance", () => {
    const db = getDb()
    expect(db).toBeDefined()
    expect(typeof db.run).toBe("function")
    expect(typeof db.prepare).toBe("function")
    expect(typeof db.query).toBe("function")
  })

  it("getDb returns the same instance on repeated calls (singleton)", () => {
    const db1 = getDb()
    const db2 = getDb()
    expect(db1).toBe(db2)
  })
})

describe("DbServiceLive", () => {
  it("provides a db field via Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* DbService
        return db
      }).pipe(Effect.provide(DbServiceLive)),
    )

    expect(result).toBeDefined()
    expect(typeof result.run).toBe("function")
  })
})
