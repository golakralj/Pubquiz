var CACHE = 'inquizus-v3';
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(['./index.html','./questions.js','./app.js','./manifest.json','./icon-192.png','./icon-512.png']);
    })
  );
});
self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});
