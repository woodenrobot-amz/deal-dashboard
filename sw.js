self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('wr-v1').then((cache) => cache.addAll(['index.html', 'config.js']))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
