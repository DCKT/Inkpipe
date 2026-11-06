import { Duration, Effect, Option } from "effect"

import { type ApiClientService, ApiFailure, callApi } from "./api"

// Web-push subscription, as plain effects over an injectable "browser".

export const STORAGE_KEY = "push-subscribed"

export type PushStatus = "Unsupported" | "Denied" | "Default" | "Subscribed"

/** The slice of the browser this flow touches, so tests can fake it. */
export interface PushBrowser {
  readonly isSupported: () => boolean
  readonly permission: () => NotificationPermission
  readonly requestPermission: () => Promise<NotificationPermission>
  readonly registration: () => Promise<PushRegistration>
  readonly storedFlag: () => string | null
  readonly setStoredFlag: (value: boolean) => void
}

export interface PushRegistration {
  readonly getSubscription: () => Promise<PushSubscriptionLike | null>
  readonly subscribe: (
    applicationServerKey: Uint8Array<ArrayBuffer>,
  ) => Promise<PushSubscriptionLike>
}

export interface PushSubscriptionLike {
  readonly endpoint: string
  readonly toJSON: () => {
    readonly endpoint?: string
    readonly keys?: Readonly<Record<string, string>>
  }
  readonly unsubscribe: () => Promise<boolean>
}

/** VAPID keys arrive URL-safe base64 encoded; the browser wants raw bytes. */
export const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }

  return bytes
}

export const statusFrom = (
  isSupported: boolean,
  permission: NotificationPermission,
  storedFlag: string | null,
): PushStatus => {
  if (!isSupported) {
    return "Unsupported"
  }

  if (permission === "denied") {
    return "Denied"
  }

  return permission === "granted" && storedFlag === "true" ? "Subscribed" : "Default"
}

/** Reads lazily: where `Notification` doesn't exist, only `isSupported` may be touched. */
export const detectStatus = (browser: PushBrowser): PushStatus =>
  browser.isSupported()
    ? statusFrom(true, browser.permission(), browser.storedFlag())
    : "Unsupported"

const failure = (message: string) => new ApiFailure({ message })

const attempt = <A>(run: () => Promise<A>, message: string): Effect.Effect<A, ApiFailure> =>
  Effect.tryPromise({ try: run, catch: () => failure(message) })

/** `Dismissed`: the prompt was closed without an answer, so we may ask again later. */
export type SubscribeOutcome = "Subscribed" | "Denied" | "Dismissed"

/** A service worker that never registers would otherwise leave "Enabling..." hanging. */
export const REGISTRATION_TIMEOUT = Duration.seconds(10)

/**
 * Ask permission, then subscribe this browser and tell the server. Declining the
 * permission prompt is a normal outcome (`Denied`), not an error.
 */
export const subscribe = (
  browser: PushBrowser,
): Effect.Effect<SubscribeOutcome, ApiFailure, ApiClientService> =>
  Effect.gen(function* () {
    if (!browser.isSupported()) {
      return yield* Effect.fail(failure("Notifications aren't supported in this browser"))
    }

    const permission = yield* attempt(
      () => browser.requestPermission(),
      "Couldn't ask for permission",
    )

    if (permission !== "granted") {
      return permission === "denied" ? ("Denied" as const) : ("Dismissed" as const)
    }

    const registration = yield* attempt(
      () => browser.registration(),
      "The service worker isn't ready",
    ).pipe(
      Effect.timeoutOrElse({
        duration: REGISTRATION_TIMEOUT,
        orElse: () => Effect.fail(failure("The service worker isn't ready")),
      }),
    )
    const { publicKey } = yield* callApi((client) => client.push.vapidPublicKey())
    const existing = yield* attempt(
      () => registration.getSubscription(),
      "Couldn't read the subscription",
    )
    const subscription = yield* Option.match(Option.fromNullishOr(existing), {
      onSome: (current) => Effect.succeed(current),
      onNone: () =>
        attempt(
          () => registration.subscribe(urlBase64ToUint8Array(publicKey)),
          "Couldn't subscribe",
        ),
    })

    const json = subscription.toJSON()
    const { endpoint } = json
    const p256dh = json.keys?.["p256dh"]
    const auth = json.keys?.["auth"]

    if (endpoint === undefined || p256dh === undefined || auth === undefined) {
      return yield* Effect.fail(failure("The browser gave an incomplete subscription"))
    }

    yield* callApi((client) =>
      client.push.subscribe({ payload: { endpoint, keys: { p256dh, auth } } }),
    )
    browser.setStoredFlag(true)

    return "Subscribed" as const
  })

/** Stop notifications: tell the server, drop the browser subscription, forget the flag. */
export const unsubscribe = (
  browser: PushBrowser,
): Effect.Effect<void, ApiFailure, ApiClientService> =>
  Effect.gen(function* () {
    if (browser.isSupported()) {
      const registration = yield* attempt(
        () => browser.registration(),
        "The service worker isn't ready",
      )
      const existing = yield* attempt(
        () => registration.getSubscription(),
        "Couldn't read the subscription",
      )

      if (existing !== null) {
        yield* callApi((client) =>
          client.push.unsubscribe({ payload: { endpoint: existing.endpoint } }),
        )
        yield* attempt(() => existing.unsubscribe(), "Couldn't unsubscribe")
      }
    }

    browser.setStoredFlag(false)
  })

/** The real browser. */
export const realBrowser: PushBrowser = {
  isSupported: () =>
    "Notification" in window && "serviceWorker" in navigator && "PushManager" in window,
  permission: () => Notification.permission,
  requestPermission: () => Notification.requestPermission(),
  registration: async () => {
    const registration = await navigator.serviceWorker.ready

    return {
      getSubscription: () => registration.pushManager.getSubscription(),
      subscribe: (applicationServerKey) =>
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }),
    }
  },
  storedFlag: () => localStorage.getItem(STORAGE_KEY),
  setStoredFlag: (value) => {
    if (value) {
      localStorage.setItem(STORAGE_KEY, "true")
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  },
}
