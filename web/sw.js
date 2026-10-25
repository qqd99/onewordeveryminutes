/**
 * Vocabulary SRS Service Worker
 * Caches application shell and vocabulary catalog for 100% offline usage.
 */

const CACHE_NAME = "vocab-srs-cache-v28";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./style.css?v=28",
  "./picture-catalog.js",
  "./picture-catalog.js?v=28",
  "./pictures/pictures-1.svg",
  "./pictures/pictures-2.svg",
  "./pictures/pictures-3.svg",
  "./pictures/pictures-4.svg",
  "./pictures/pictures-5.svg",
  "./pictures/pictures-6.svg",
  "./pictures/pictures-7.svg",
  "./pictures/pictures-8.svg",
  "./pictures/pictures-9.svg",
  "./translation.js",
  "./translation.js?v=25",
  "./app.js",
  "./app.js?v=28",
  "./srs.js",
  "./srs.js?v=19",
  "./vocabulary.json",
  "./vocabulary/common-01.json",
  "./vocabulary/common-02.json",
  "./vocabulary/common-03.json",
  "./vocabulary/common-04.json",
  "./vocabulary/common-05.json",
  "./vocabulary/common-06.json",
  "./manifest.webmanifest",
  "./icons/icon16.png",
  "./icons/icon32.png",
  "./icons/icon48.png",
  "./icons/icon128.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Don't intercept external audio APIs (dict.youdao, translate.google)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
