/* eslint-disable no-restricted-globals */

const CACHE = 'f1-pwa-v1';

const PRECACHE = [
  '/manifest.webmanifest',
  '/pwa-icon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        // ignore
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k === CACHE ? Promise.resolve() : caches.delete(k))));
      } catch {
        // ignore
      }
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/pwa-icon.svg' ||
    url.pathname === '/pwa-192.png' ||
    url.pathname === '/pwa-512.png' ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/favicon.ico';

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Network-first for everything else.
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        return cached || Response.error();
      }
    })()
  );
});
