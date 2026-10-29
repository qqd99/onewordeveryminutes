/**
 * Vocabulary SRS Service Worker
 * Caches the application shell, vocabulary and bundled real photos for offline study.
 */

const CACHE_NAME = "vocab-srs-cache-v35";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./style.css?v=35",
  "./picture-catalog.js",
  "./internet-picture.js",
  "./internet-picture.js?v=34",
  "./ai-image-config.js",
  "./picture-catalog.js?v=30",
  "./photos/almond.jpg",
  "./photos/apple.jpg",
  "./photos/avocado.jpg",
  "./photos/balloon.jpg",
  "./photos/banana.jpg",
  "./photos/bicycle.jpg",
  "./photos/blackberry.jpg",
  "./photos/bridge.jpg",
  "./photos/butterfly.jpg",
  "./photos/cabbage.jpg",
  "./photos/cantaloupe.jpg",
  "./photos/canyon.jpg",
  "./photos/carrot.jpg",
  "./photos/cat.jpg",
  "./photos/cherry.jpg",
  "./photos/chess.jpg",
  "./photos/clock.jpg",
  "./photos/coconut.jpg",
  "./photos/colosseum.jpg",
  "./photos/corn.jpg",
  "./photos/cucumber.jpg",
  "./photos/dates.jpg",
  "./photos/dragonfruit.jpg",
  "./photos/eggplant.jpg",
  "./photos/firetruck.jpg",
  "./photos/garlic.jpg",
  "./photos/ginger.jpg",
  "./photos/grape.jpg",
  "./photos/guitar.jpg",
  "./photos/kiwi.jpg",
  "./photos/lemon.jpg",
  "./photos/lighthouse.jpg",
  "./photos/mango.jpg",
  "./photos/mushroom.jpg",
  "./photos/onion.jpg",
  "./photos/orange.jpg",
  "./photos/papaya.jpg",
  "./photos/peach.jpg",
  "./photos/peanut.jpg",
  "./photos/pear.jpg",
  "./photos/pepper.jpg",
  "./photos/pineapple.jpg",
  "./photos/pizza.jpg",
  "./photos/plum.jpg",
  "./photos/potato.jpg",
  "./photos/raspberry.jpg",
  "./photos/redcurrant.jpg",
  "./photos/rock.jpg",
  "./photos/sailboat.jpg",
  "./photos/strawberry.jpg",
  "./photos/sunflower.jpg",
  "./photos/telescope.jpg",
  "./photos/tomato.jpg",
  "./photos/typewriter.jpg",
  "./photos/waterfall.jpg",
  "./photos/watermelon.jpg",
  "./translation.js",
  "./translation.js?v=25",
  "./app.js",
  "./app.js?v=35",
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
