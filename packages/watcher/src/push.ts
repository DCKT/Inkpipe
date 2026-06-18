import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync, readFileSync } from "node:fs"
import webpush from "web-push"

const CONFIG_DIR = join(homedir(), ".inkpipe")

interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

let vapidKeys: { publicKey: string; privateKey: string } | null = null

function loadVapidKeys(): { publicKey: string; privateKey: string } | null {
  const vapidPath = join(CONFIG_DIR, "vapid.json")
  if (!existsSync(vapidPath)) return null
  try {
    const keys = JSON.parse(readFileSync(vapidPath, "utf-8"))
    if (!keys.publicKey || !keys.privateKey) return null
    return keys
  } catch {
    return null
  }
}

function loadSubscriptions(): PushSubscription[] {
  const subsPath = join(CONFIG_DIR, "push_subscriptions.json")
  if (!existsSync(subsPath)) return []
  try {
    return JSON.parse(readFileSync(subsPath, "utf-8"))
  } catch {
    return []
  }
}

export function sendPushNotification(payload: { title: string; body: string; tag?: string }): void {
  if (!vapidKeys) {
    vapidKeys = loadVapidKeys()
  }
  if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.log("[watcher:push] VAPID keys not configured, skipping push")
    return
  }

  webpush.setVapidDetails(
    "mailto:inkpipe@localhost",
    vapidKeys.publicKey,
    vapidKeys.privateKey,
  )

  const subs = loadSubscriptions()
  if (subs.length === 0) return

  for (const sub of subs) {
    webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log("[watcher:push] Removing expired subscription:", sub.endpoint)
        return
      }
      console.error("[watcher:push] Push failed:", err.message)
    })
  }
}
