// Integration tests for the HTTP mechanics introduced by the Bun.serve() ->
// HttpApi migration: schema-validation error bodies, CORS, error-status
// mapping, and path-param disambiguation (e.g. /api/watches/unread-count vs
// /api/watches/:id). Exercises the real watch capabilities (contracts and handlers) through
// the same HTTP projection production serves (see server.ts),
// against a mocked WatchStoreService so no database is needed.
import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { WatchId, WatchAlertId, WatchNotFoundError, WatchStoreError } from "@inkpipe/shared"
import type { Watch, WatchWithUnread } from "@inkpipe/shared"
import { WatchStoreService } from "../layers/storage/WatchStore"
import { makeCapabilityHandler } from "./testing"

const now = new Date().toISOString()
const watch: Watch = {
  id: WatchId.make(1),
  name: "Test",
  enabled: true,
  query: "test",
  intervalSeconds: 600,
  filterGroups: [],
  subfolder: null,
  createdAt: now,
  updatedAt: now,
}
const watchWithUnread: WatchWithUnread = { ...watch, unreadCount: 0 }

type WatchStoreShape = typeof WatchStoreService.Service

function makeStore(overrides: Partial<WatchStoreShape> = {}) {
  return Layer.succeed(WatchStoreService, {
    listWatches: Effect.succeed([watchWithUnread]),
    listEnabledWatches: Effect.succeed([watch]),
    getWatch: (id) =>
      id === watch.id
        ? Effect.succeed(watch)
        : Effect.fail(new WatchNotFoundError({ message: "not found" })),
    createWatch: () => Effect.succeed(watch),
    updateWatch: () => Effect.succeed(watch),
    deleteWatch: () => Effect.void,
    listAlerts: () => Effect.succeed([]),
    getAlert: () => Effect.fail(new WatchNotFoundError({ message: "not found" })),
    acknowledgeAlert: () => Effect.void,
    acknowledgeAllAlerts: () => Effect.void,
    insertAlert: () => Effect.succeed(WatchAlertId.make(1)),
    hasAlertForGuid: () => Effect.succeed(false),
    getUnreadCount: Effect.succeed(3),
    ...overrides,
  })
}

const makeHandler = (store = makeStore()) => ({
  handler: makeCapabilityHandler(store, { cors: true }),
})

describe("watches HTTP mechanics", () => {
  it("returns a real JSON message (not an empty body) for a schema-validation failure", async () => {
    const { handler } = makeHandler()
    const res = await handler(
      new Request("http://localhost/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { _tag: string; message: string }
    expect(body._tag).toBe("RequestValidationError")
    expect(typeof body.message).toBe("string")
    expect(body.message.length).toBeGreaterThan(0)
  })

  it("returns a real JSON message for a malformed path param", async () => {
    const { handler } = makeHandler()
    const res = await handler(new Request("http://localhost/api/watches/not-a-number"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { _tag: string; message: string }
    expect(body._tag).toBe("RequestValidationError")
    expect(body.message).toMatch(/\bid\b/)
  })

  it("maps WatchNotFoundError to 404 with a message", async () => {
    const { handler } = makeHandler()
    const res = await handler(new Request("http://localhost/api/watches/999"))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { _tag: string; message: string }
    expect(body._tag).toBe("WatchNotFoundError")
  })

  it("maps WatchStoreError to 500", async () => {
    const { handler } = makeHandler(
      makeStore({ listWatches: Effect.fail(new WatchStoreError({ message: "db down" })) }),
    )
    const res = await handler(new Request("http://localhost/api/watches"))
    expect(res.status).toBe(500)
  })

  it("resolves the static /unread-count route ahead of the :id param route", async () => {
    const { handler } = makeHandler()
    const res = await handler(new Request("http://localhost/api/watches/unread-count"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body).toEqual({ count: 3 })
  })

  it("applies CORS headers on both success and error responses", async () => {
    const { handler } = makeHandler()
    const ok = await handler(new Request("http://localhost/api/watches"))
    expect(ok.headers.get("access-control-allow-origin")).toBe("*")

    const notFound = await handler(new Request("http://localhost/api/watches/999"))
    expect(notFound.headers.get("access-control-allow-origin")).toBe("*")

    const preflight = await handler(
      new Request("http://localhost/api/watches", {
        method: "OPTIONS",
        headers: { Origin: "http://example.com", "Access-Control-Request-Method": "GET" },
      }),
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*")
  })
})
