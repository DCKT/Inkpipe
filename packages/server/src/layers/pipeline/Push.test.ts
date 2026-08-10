import { Effect, Layer } from "effect"
import { describe, it, expect, beforeEach, afterEach } from "@effect/vitest"
import { vi } from "vitest"
import type { PushSubscriptionRequest } from "@inkpipe/shared"
import { PushService, PushServiceLive } from "./Push"
import { LogServiceLive } from "../core/Log"

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }))

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => files.has(path)),
  readFileSync: vi.fn((path: string) => {
    const content = files.get(path)
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    files.set(path, content)
  }),
  mkdirSync: vi.fn(() => undefined),
}))

const { sendNotificationMock, generateVAPIDKeysMock, setVapidDetailsMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn((_sub: unknown, _payload?: unknown) => Promise.resolve()),
  generateVAPIDKeysMock: vi.fn(() => ({ publicKey: "pub-key", privateKey: "priv-key" })),
  setVapidDetailsMock: vi.fn(),
}))

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: generateVAPIDKeysMock,
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
}))

function makeProgram<T, E>(prog: (svc: typeof PushService.Service) => Effect.Effect<T, E>) {
  return Effect.gen(function* () {
    const svc = yield* PushService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(PushServiceLive, LogServiceLive)))
}

const sub1: PushSubscriptionRequest = {
  endpoint: "https://push.example.com/sub1",
  keys: { p256dh: "p1", auth: "a1" },
}
const sub2: PushSubscriptionRequest = {
  endpoint: "https://push.example.com/sub2",
  keys: { p256dh: "p2", auth: "a2" },
}

beforeEach(() => {
  files.clear()
  sendNotificationMock.mockReset().mockResolvedValue(undefined)
  generateVAPIDKeysMock.mockClear()
  setVapidDetailsMock.mockClear()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PushService", () => {
  it.effect("getVapidPublicKey generates and persists keys on first call", () =>
    Effect.gen(function* () {
      const key = yield* makeProgram((svc) => svc.getVapidPublicKey)
      expect(key).toBe("pub-key")
      expect(generateVAPIDKeysMock).toHaveBeenCalledTimes(1)
    }))

  it.effect("getVapidPublicKey reuses persisted keys on subsequent calls", () =>
    Effect.gen(function* () {
      yield* makeProgram((svc) => svc.getVapidPublicKey)
      yield* makeProgram((svc) => svc.getVapidPublicKey)
      expect(generateVAPIDKeysMock).toHaveBeenCalledTimes(1)
    }))

  it.effect("addSubscription persists a new subscription", () =>
    Effect.gen(function* () {
      yield* makeProgram((svc) => svc.addSubscription(sub1))
      const persisted = JSON.parse([...files.values()].find((v) => v.includes("sub1"))!)
      expect(persisted).toHaveLength(1)
      expect(persisted[0].endpoint).toBe(sub1.endpoint)
    }))

  it.effect("addSubscription does not duplicate an existing endpoint", () =>
    Effect.gen(function* () {
      yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.addSubscription(sub1)
          yield* svc.addSubscription(sub1)
        }),
      )
      const persisted = JSON.parse([...files.values()].find((v) => v.includes("sub1"))!)
      expect(persisted).toHaveLength(1)
    }))

  it.effect("removeSubscription removes only the matching endpoint", () =>
    Effect.gen(function* () {
      yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.addSubscription(sub1)
          yield* svc.addSubscription(sub2)
          yield* svc.removeSubscription(sub1.endpoint)
        }),
      )
      const persisted = JSON.parse([...files.values()].find((v) => v.includes("sub2"))!)
      expect(persisted).toHaveLength(1)
      expect(persisted[0].endpoint).toBe(sub2.endpoint)
    }))

  it.effect("sendNotification fans out to every subscription", () =>
    Effect.gen(function* () {
      yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.addSubscription(sub1)
          yield* svc.addSubscription(sub2)
          yield* svc.sendNotification({ title: "t", body: "b" })
        }),
      )
      expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    }))

  it.effect("sendNotification removes a subscription that reports 410 Gone and persists the removal", () =>
    Effect.gen(function* () {
      sendNotificationMock.mockImplementation((sub: unknown) =>
        (sub as PushSubscriptionRequest).endpoint === sub1.endpoint
          ? Promise.reject(Object.assign(new Error("gone"), { statusCode: 410 }))
          : Promise.resolve(),
      )

      const remaining = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.addSubscription(sub1)
          yield* svc.addSubscription(sub2)
          yield* svc.sendNotification({ title: "t", body: "b" })
          // A second send should no longer attempt delivery to the expired subscription.
          yield* svc.sendNotification({ title: "t2", body: "b2" })
          return JSON.parse([...files.values()].find((v) => v.includes("sub2"))!)
        }),
      )

      expect(remaining).toHaveLength(1)
      expect(remaining[0].endpoint).toBe(sub2.endpoint)
      // 2 sends: attempt 1 hits both subs (2 calls), attempt 2 only hits the surviving one (1 call)
      expect(sendNotificationMock).toHaveBeenCalledTimes(3)
    }))

  it.effect("sendNotification removes a subscription that reports 404 Not Found", () =>
    Effect.gen(function* () {
      sendNotificationMock.mockRejectedValue(Object.assign(new Error("not found"), { statusCode: 404 }))

      const remaining = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.addSubscription(sub1)
          yield* svc.sendNotification({ title: "t", body: "b" })
          return files.get([...files.keys()].find((k) => k.includes("subscriptions"))!)
        }),
      )

      expect(JSON.parse(remaining!)).toEqual([])
    }))

  it.effect("sendNotification does not remove a subscription on a non-expiry error", () =>
    Effect.gen(function* () {
      sendNotificationMock.mockRejectedValue(Object.assign(new Error("server error"), { statusCode: 500 }))

      const remaining = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.addSubscription(sub1)
          yield* svc.sendNotification({ title: "t", body: "b" })
          return JSON.parse(files.get([...files.keys()].find((k) => k.includes("subscriptions"))!)!)
        }),
      )

      expect(remaining).toHaveLength(1)
    }))
})
