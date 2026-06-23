import { Effect, Layer } from "effect"
import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import webpush from "web-push"
import type { PushSubscriptionRequest } from "@inkpipe/shared"
import { LogService } from "./Log"

export class PushService extends Effect.Tag("PushService")<
  PushService,
  {
    readonly getVapidPublicKey: Effect.Effect<string>
    readonly addSubscription: (sub: PushSubscriptionRequest) => Effect.Effect<void>
    readonly removeSubscription: (endpoint: string) => Effect.Effect<void>
    readonly sendNotification: (payload: { title: string; body: string; tag?: string }) => Effect.Effect<void>
  }
>() {}

const CONFIG_DIR = join(homedir(), ".inkpipe")
const VAPID_PATH = join(CONFIG_DIR, "vapid.json")
const SUBS_PATH = join(CONFIG_DIR, "push_subscriptions.json")

function ensureVapidKeysSync(): { publicKey: string; privateKey: string } {
  mkdirSync(CONFIG_DIR, { recursive: true })
  if (!existsSync(VAPID_PATH)) {
    const keys = webpush.generateVAPIDKeys()
    writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2))
    return keys
  }
  const existing = JSON.parse(readFileSync(VAPID_PATH, "utf-8"))
  if (!existing.publicKey || !existing.privateKey) {
    const keys = webpush.generateVAPIDKeys()
    writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2))
    return keys
  }
  return existing
}

function readSubscriptionsSync(): PushSubscriptionRequest[] {
  if (!existsSync(SUBS_PATH)) return []
  try {
    return JSON.parse(readFileSync(SUBS_PATH, "utf-8"))
  } catch {
    return []
  }
}

function writeSubscriptionsSync(subs: PushSubscriptionRequest[]): void {
  writeFileSync(SUBS_PATH, JSON.stringify(subs, null, 2))
}

export const PushServiceLive = Layer.effect(
  PushService,
  Effect.gen(function* () {
    const log = yield* LogService
    const getVapidPublicKey = Effect.sync(() => ensureVapidKeysSync().publicKey)

    const addSubscription = (sub: PushSubscriptionRequest) =>
      Effect.sync(() => {
        const subs = readSubscriptionsSync()
        if (!subs.some((s) => s.endpoint === sub.endpoint)) {
          subs.push(sub)
          writeSubscriptionsSync(subs)
        }
      })

    const removeSubscription = (endpoint: string) =>
      Effect.sync(() => {
        const subs = readSubscriptionsSync().filter((s) => s.endpoint !== endpoint)
        writeSubscriptionsSync(subs)
      })

    const sendNotification = (payload: { title: string; body: string; tag?: string }) =>
      Effect.tryPromise({
        try: async () => {
          const keys = ensureVapidKeysSync()
          webpush.setVapidDetails("mailto:inkpipe@localhost", keys.publicKey, keys.privateKey)
          const subs = readSubscriptionsSync()
          await Promise.allSettled(
            subs.map((sub) =>
              webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                  Effect.runSync(log.info("push", "Removing expired subscription:", sub.endpoint))
                  return
                }
                throw err
              }),
            ),
          )
        },
        catch: (e) => {
          if (e instanceof Error) Effect.runSync(log.error("push", "Failed to send:", e.message))
          return undefined as void
        },
      }) as Effect.Effect<void>

    return { getVapidPublicKey, addSubscription, removeSubscription, sendNotification }
  }),
)
