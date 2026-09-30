/* global self, caches */

import {
  CACHE_VERSION,
  PRECACHE_URLS,
  STATIC_CACHE_NAME,
  isCacheableResponse,
  isSameOriginRequest,
  isSensitiveRequest,
  isStaticAssetRequest,
} from "/pwa/cache-policy.js";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("zoption-pwa-") && !name.startsWith(CACHE_VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const appOrigin = self.location.origin;

  // Cross-origin requests (the API, Supabase, analytics) stay with the page;
  // re-fetching them here would break CORS.
  if (!isSameOriginRequest(request, appOrigin)) {
    return;
  }

  if (isSensitiveRequest(request, appOrigin)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isStaticAssetRequest(request, appOrigin)) {
    event.respondWith(cacheFirstStatic(request));
  }
});
