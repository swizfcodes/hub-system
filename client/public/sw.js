/* Hub service worker — web push + installability.
   The fetch handler is a network passthrough (one must exist for the app
   to be installable); push and notificationclick deliver chat/bell alerts
   when no tab is open. */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal passthrough — installability requires a fetch handler.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Hub", body: event.data.text() };
  }
  const { title = "Hub", body = "", url = "/", tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || undefined,
      icon: "/android-chrome-192x192.png",
      badge: "/android-chrome-192x192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
