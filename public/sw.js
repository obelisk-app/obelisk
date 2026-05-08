// Minimal service worker — exists so Chrome / Edge / Brave consider the
// site installable as a PWA ("Add to home screen" / install icon in the
// address bar). It is intentionally pass-through: no offline caching, no
// background sync, no push handling. The whole app continues to load
// straight from the network exactly like the regular tab.
//
// Bump CACHE_VERSION to force every installed client to throw away the
// previous worker and re-register.
const CACHE_VERSION = 'obelisk-v1';

self.addEventListener('install', () => {
  // Activate the new worker as soon as it finishes installing instead of
  // waiting for every old tab to close. The fetch handler is pass-through
  // so a mid-flight upgrade can't break in-flight requests.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Reap any caches from a previous CACHE_VERSION.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Chrome's installability check requires a fetch handler to be present at
// activation. We don't actually want to intercept anything — just pass the
// browser's default through.
self.addEventListener('fetch', () => {
  // Default behavior: do not call event.respondWith().
});
