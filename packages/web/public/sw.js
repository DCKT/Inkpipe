self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "Inkpipe", body: "New match found" }
  const options = {
    body: data.body ?? "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag ?? "inkpipe-watch",
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Inkpipe", options),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow("/watches"),
  )
})
