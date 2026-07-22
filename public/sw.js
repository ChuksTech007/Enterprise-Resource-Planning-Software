/* ------------------------------------------------------------------ *
 * PrintPress service worker.
 *
 * Its only job is READS: keep the app openable and keep the last known
 * data visible when the network is gone.
 *
 * Writes are deliberately NOT handled here. They are queued in IndexedDB by
 * lib/client.js on the main thread, where the app can show the cashier how
 * many entries are still waiting and replay them in order. Splitting it this
 * way means there is exactly one place that decides whether a sale has been
 * saved — which is the thing that must never be ambiguous.
 * ------------------------------------------------------------------ */

const VERSION = 'v1';
const SHELL_CACHE = `printpress-shell-${VERSION}`;
const DATA_CACHE = `printpress-data-${VERSION}`;

const SHELL_URLS = ['/', '/sales/new', '/jobs', '/debts', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // One bad URL must not fail the whole install, so each is added on its own.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Writes go straight to the network. If they fail, lib/client.js queues them.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache auth or CSV downloads — a stale session or an old export
  // would be worse than an error.
  if (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/reports/export')) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Next.js build assets are content-hashed, so cache-first is always safe.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Give API callers a JSON body they can actually parse, rather than an
    // opaque network error.
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'You are offline and this has not been loaded before.', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function navigationHandler(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match('/'));
    if (cached) return cached;
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Offline</title>
       <div style="font-family:system-ui;padding:2rem;text-align:center">
         <h1 style="font-size:1.1rem">No network</h1>
         <p style="color:#64748b">This page has not been opened on this device before, so there is nothing saved to show.
         Anything you have already recorded is safe and will sync when the network returns.</p>
       </div>`,
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
