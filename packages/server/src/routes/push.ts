import { Effect } from "effect"
import type { PushSubscriptionRequest } from "@inkpipe/shared"
import { join } from "node:path"
import { homedir } from "node:os"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"

const CONFIG_DIR = join(homedir(), ".inkpipe")
const VAPID_PATH = join(CONFIG_DIR, "vapid.json")

function getOrCreateVapidKeys(): { publicKey: string; privateKey: string } {
  mkdirSync(CONFIG_DIR, { recursive: true })
  if (existsSync(VAPID_PATH)) {
    return JSON.parse(readFileSync(VAPID_PATH, "utf-8"))
  }
  const keys = { publicKey: "", privateKey: "" }
  writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2))
  return keys
}

export const getVapidPublicKeyHandler = Effect.gen(function* () {
  const keys = yield* Effect.sync(() => getOrCreateVapidKeys())
  return Response.json({ publicKey: keys.publicKey })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
  ),
)

export const subscribeHandler = (body: PushSubscriptionRequest) =>
  Effect.gen(function* () {
    const subsPath = join(CONFIG_DIR, "push_subscriptions.json")
    let subs: PushSubscriptionRequest[] = []
    if (existsSync(subsPath)) {
      subs = JSON.parse(readFileSync(subsPath, "utf-8"))
    }
    const exists = subs.some((s) => s.endpoint === body.endpoint)
    if (!exists) {
      subs.push(body)
      writeFileSync(subsPath, JSON.stringify(subs, null, 2))
    }
    return Response.json({ success: true }, { status: 201 })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
    ),
  )

export const unsubscribeHandler = (body: { endpoint: string }) =>
  Effect.gen(function* () {
    const subsPath = join(CONFIG_DIR, "push_subscriptions.json")
    if (existsSync(subsPath)) {
      let subs: PushSubscriptionRequest[] = JSON.parse(readFileSync(subsPath, "utf-8"))
      subs = subs.filter((s) => s.endpoint !== body.endpoint)
      writeFileSync(subsPath, JSON.stringify(subs, null, 2))
    }
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
    ),
  )
