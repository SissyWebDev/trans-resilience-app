// ─────────────────────────────────────────────────────────────────────────────
// service-worker.js — Trans Resilience PWA
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'tr-cache-v1';

// App Shell — everything needed to display
// the offline screen even when there's no network at all.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json'
];


// ── EVENT 1: Install ──────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately, don't wait
  );
});


// ── EVENT 2: Activate ─────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME) // find old caches
          .map(name => caches.delete(name))    // delete them
      )
    ).then(() => self.clients.claim()) // take control of open pages immediately
  );
});


// ── EVENT 3: Fetch ────────────────────────────────────────────────────────────
//   1. Try to fetch fresh content from the network
//   2. If that succeeds, cache it for later and return it
//   3. If the network fails, serve whatever we have in cache
//   4. If cache is also empty, show the offline page

self.addEventListener('fetch', event => {

  // Only handle GET requests — don't intercept form posts etc.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Network succeeded — clone and cache the response
        // (Cloned because a response can only be consumed once)
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        // Timestamp for the offline screen
        // (Only relevant for the main page, not every asset)
        if (event.request.url.includes('index.html') ||
            event.request.url.endsWith('/')) {
          // Send message to the main page to save the timestamp
          self.clients.matchAll().then(clients => {
            clients.forEach(client =>
              client.postMessage({ type: 'SYNC_TIMESTAMP' })
            );
          });
        }

        return networkResponse;
      })
      .catch(() => {
        // Network failed — try the cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            // Cache also empty — show offline page
            return caches.match('/offline.html');
          });
      })
  );
});
