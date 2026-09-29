/* global self, caches */

// zoption.site served the web app and its PWA service worker until the app moved to
// app.zoption.site. Browsers that installed that worker still run it here and would keep
// serving cached pages, so this replacement clears its caches, unregisters itself, and
// reloads open tabs onto the live site. Keep it until the old worker can no longer exist.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("zoption-pwa-")).map((name) => caches.delete(name)),
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
