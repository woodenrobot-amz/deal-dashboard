// Deal Dashboard service worker.
//
// Precaches the app shell so the app opens offline, and serves
// data/deals.json stale-while-revalidate so the last downloaded deals
// are shown when the network is unavailable. Bump CACHE_VERSION when a
// shell file changes so the activate handler drops the old caches.

var CACHE_VERSION = "v2";
var SHELL_CACHE = "wr-deal-command-shell-" + CACHE_VERSION;
var DATA_CACHE = "wr-deal-command-data-" + CACHE_VERSION;

// Shell files, relative to this worker's location (the app root).
// Icon paths match manifest.json.
var SHELL_FILES = [
  "./",
  "index.html",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL_FILES);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== SHELL_CACHE && key !== DATA_CACHE) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Only handle same-origin GET requests. Cross-origin requests
  // (GitHub API calls, deal images, the Keepa status file) pass
  // through to the network untouched and are never cached.
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          return caches.match("index.html");
        });
      })
    );
    return;
  }

  if (url.pathname.endsWith("/data/deals.json")) {
    event.respondWith(staleWhileRevalidateDeals(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

// data/deals.json: stale-while-revalidate. Serve the cached copy
// immediately when one exists and refresh it in the background. With
// no cached copy, wait for the network; if the network fails too,
// reject so the page's existing "Could not load deals.json" handling
// runs.
//
// index.html fetches deals.json with cache: "no-store", so cache
// lookups and stores use a fresh default-mode request for the same
// URL instead of the original request.
function staleWhileRevalidateDeals(request) {
  var cacheRequest = new Request(request.url);
  var networkFetch = fetch(cacheRequest)
    .then(function (response) {
      if (response && response.ok) {
        storeInDataCache(cacheRequest, response.clone());
      }
      return response;
    })
    .catch(function () {
      return null;
    });

  return caches.match(cacheRequest).then(function (cached) {
    if (cached) return cached;
    return networkFetch.then(function (response) {
      if (response) return response;
      throw new Error("deals.json unavailable: network failed and no cached copy exists");
    });
  });
}

// Other same-origin files: network first, cache successful responses
// for offline fallback, and serve the cached copy when the network
// fails.
function networkFirst(request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.ok) {
        storeInDataCache(new Request(request.url), response.clone());
      }
      return response;
    })
    .catch(function () {
      return caches.match(new Request(request.url));
    });
}

// Best-effort cache store: a failed store must never break the
// response being returned to the page. Callers clone the response
// synchronously before the page can consume the original.
function storeInDataCache(cacheRequest, responseCopy) {
  caches
    .open(DATA_CACHE)
    .then(function (cache) {
      return cache.put(cacheRequest, responseCopy);
    })
    .catch(function () {
      // Ignore cache store failures.
    });
}
