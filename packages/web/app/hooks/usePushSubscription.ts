import { useState, useEffect, useCallback } from "react"
import { api } from "./useApiClient"

const STORAGE_KEY = "push-subscribed"

type PushStatus = "unsupported" | "denied" | "default" | "subscribed"

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function supportsPush(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
}

function getPermissionStatus(): PushStatus {
  if (!supportsPush()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  if (Notification.permission === "granted") {
    return localStorage.getItem(STORAGE_KEY) === "true" ? "subscribed" : "default"
  }
  return "default"
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>(getPermissionStatus)

  useEffect(() => {
    const checkPermission = () => setStatus(getPermissionStatus())
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "notifications" } as PermissionDescriptor).then((perm) => {
        perm.addEventListener("change", checkPermission)
      }).catch(() => {})
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!supportsPush()) return
    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      setStatus("denied")
      return
    }

    const reg = await navigator.serviceWorker.ready
    const vapidResp = await api.get("push/vapid-public-key").json<{ publicKey: string }>()
    const applicationServerKey = urlBase64ToUint8Array(vapidResp.publicKey)

    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      })
    }

    await api.post("push/subscribe", { json: subscription.toJSON() })
    localStorage.setItem(STORAGE_KEY, "true")
    setStatus("subscribed")
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!supportsPush()) return
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()
    if (subscription) {
      const subscriptionJson = subscription.toJSON() as { endpoint: string }
      await api.delete("push/subscribe", { json: { endpoint: subscriptionJson.endpoint } })
      await subscription.unsubscribe()
    }
    localStorage.removeItem(STORAGE_KEY)
    setStatus(getPermissionStatus())
  }, [])

  return { status, subscribe, unsubscribe }
}
