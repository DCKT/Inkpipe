import { Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { describe, expect, test } from "vitest"

import { ApiClientService, ApiFailure } from "./api"
import {
  type PushBrowser,
  type PushSubscriptionLike,
  REGISTRATION_TIMEOUT,
  detectStatus,
  statusFrom,
  subscribe,
  unsubscribe,
  urlBase64ToUint8Array,
} from "./pushFlow"
import { requestJson } from "./testHttp"

describe("urlBase64ToUint8Array", () => {
  test("decodes URL-safe base64 with missing padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toStrictEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array("AQI"))).toStrictEqual([1, 2])
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toStrictEqual([251, 255])
    expect(urlBase64ToUint8Array("")).toHaveLength(0)
  })
})

describe("statusFrom / detectStatus", () => {
  test.each([
    [false, "default", null, "Unsupported"],
    [false, "granted", "true", "Unsupported"],
    [true, "denied", "true", "Denied"],
    [true, "default", null, "Default"],
    [true, "default", "true", "Default"],
    [true, "granted", null, "Default"],
    [true, "granted", "false", "Default"],
    [true, "granted", "true", "Subscribed"],
  ] as const)(
    "supported=%s permission=%s flag=%s -> %s",
    (supported, permission, flag, expected) => {
      expect(statusFrom(supported, permission, flag)).toBe(expected)
    },
  )

  test("detectStatus never reads the permission where notifications don't exist", () => {
    const { browser } = fakeBrowser({ supported: false })
    const hostile: PushBrowser = {
      ...browser,
      permission: () => {
        throw new globalThis.Error("Notification is not defined")
      },
    }
    expect(detectStatus(hostile)).toBe("Unsupported")
  })

  test("detectStatus reads the browser", () => {
    expect(detectStatus(fakeBrowser({ permission: "granted", flag: "true" }).browser)).toBe(
      "Subscribed",
    )
  })
})

type FakeOptions = {
  readonly supported?: boolean
  readonly permission?: NotificationPermission
  readonly requested?: NotificationPermission
  readonly flag?: string | null
  readonly existing?: boolean
  readonly keys?: Record<string, string>
}

const fakeBrowser = (options: FakeOptions = {}) => {
  const log: Array<string> = []
  let flag = options.flag ?? null
  const makeSub = (): PushSubscriptionLike => ({
    endpoint: "https://push.example/abc",
    toJSON: () => ({
      endpoint: "https://push.example/abc",
      keys: options.keys ?? { p256dh: "P", auth: "A" },
    }),
    unsubscribe: async () => {
      log.push("unsubscribed")
      return true
    },
  })
  let sub: PushSubscriptionLike | null = options.existing === true ? makeSub() : null
  const browser: PushBrowser = {
    isSupported: () => options.supported ?? true,
    permission: () => options.permission ?? "default",
    requestPermission: async () => {
      log.push("requested")
      return options.requested ?? "granted"
    },
    registration: async () => ({
      getSubscription: async () => sub,
      subscribe: async (key) => {
        log.push(`subscribed:${key.length}`)
        sub = makeSub()
        return sub
      },
    }),
    storedFlag: () => flag,
    setStoredFlag: (value) => {
      flag = value ? "true" : null
    },
  }
  return { browser, log, flag: () => flag }
}

const testApiLayer = (seen: Array<HttpClientRequest.HttpClientRequest> = []) => {
  const httpClient = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      seen.push(request)
      const body = request.url.endsWith("vapid-public-key")
        ? { publicKey: "AQID" }
        : { success: true }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(body), {
            status: request.method === "POST" ? 201 : 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      )
    }),
  )
  return ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
}

const run = <A, E>(
  program: Effect.Effect<A, E, ApiClientService>,
  seen: Array<HttpClientRequest.HttpClientRequest> = [],
) => Effect.runPromiseExit(program.pipe(Effect.provide(testApiLayer(seen))))

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.flatMap((r) => (r._tag === "Fail" ? [r.error] : []))[0]
    : undefined

describe("subscribe", () => {
  test("asks permission, subscribes with the server's key, registers with the server, and remembers", async () => {
    const fake = fakeBrowser()
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const exit = await run(subscribe(fake.browser), seen)
    expect(exit).toStrictEqual(Exit.succeed("Subscribed"))
    expect(fake.log).toStrictEqual(["requested", "subscribed:3"])
    expect(fake.flag()).toBe("true")
    const post = seen.find((r) => r.method === "POST")
    expect(post?.url).toBe("http://api.test/api/push/subscribe")
    expect(requestJson(post)).toStrictEqual({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "P", auth: "A" },
    })
  })

  test("reuses a subscription the browser already has", async () => {
    const fake = fakeBrowser({ existing: true })
    await run(subscribe(fake.browser))
    expect(fake.log).toStrictEqual(["requested"])
  })

  test("declining the prompt is a normal outcome and registers nothing", async () => {
    const fake = fakeBrowser({ requested: "denied" })
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    expect(await run(subscribe(fake.browser), seen)).toStrictEqual(Exit.succeed("Denied"))
    expect(seen).toHaveLength(0)
    expect(fake.flag()).toBeNull()
  })

  test("closing the prompt without answering is not a refusal", async () => {
    const fake = fakeBrowser({ requested: "default" })
    expect(await run(subscribe(fake.browser))).toStrictEqual(Exit.succeed("Dismissed"))
  })

  test("a service worker that never becomes ready fails instead of hanging", async () => {
    const stuck: PushBrowser = {
      ...fakeBrowser().browser,
      registration: () => new Promise(() => undefined),
    }
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.exit(subscribe(stuck).pipe(Effect.provide(testApiLayer()))),
        )
        yield* TestClock.adjust(REGISTRATION_TIMEOUT)
        return yield* Fiber.join(fiber)
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    )
    expect(failureOf(exit)).toHaveProperty("message", "The service worker isn't ready")
  })

  test("an unsupported browser fails with a clear message", async () => {
    const failure = failureOf(await run(subscribe(fakeBrowser({ supported: false }).browser)))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure).toHaveProperty("message", "Notifications aren't supported in this browser")
  })

  test("an incomplete browser subscription is refused before telling the server", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const failure = failureOf(
      await run(subscribe(fakeBrowser({ keys: { p256dh: "P" } }).browser), seen),
    )
    expect(failure).toHaveProperty("message", "The browser gave an incomplete subscription")
    expect(seen.some((r) => r.method === "POST")).toBe(false)
  })
})

describe("unsubscribe", () => {
  test("tells the server, drops the browser subscription and forgets the flag", async () => {
    const fake = fakeBrowser({ existing: true, flag: "true" })
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    expect((await run(unsubscribe(fake.browser), seen))._tag).toBe("Success")
    const del = seen.find((r) => r.method === "DELETE")
    expect(del?.url).toBe("http://api.test/api/push/subscribe")
    expect(requestJson(del)).toStrictEqual({ endpoint: "https://push.example/abc" })
    expect(fake.log).toStrictEqual(["unsubscribed"])
    expect(fake.flag()).toBeNull()
  })

  test("with no browser subscription it just forgets the flag", async () => {
    const fake = fakeBrowser({ flag: "true" })
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(unsubscribe(fake.browser), seen)
    expect(seen).toHaveLength(0)
    expect(fake.flag()).toBeNull()
  })
})
