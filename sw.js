var CACHE_NAME = 'phoenixfuel-v31';
var FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/login.html',
  '/manifest.json',
  '/pf-config.js',
  '/pf-ordini.js',
  '/pf-deposito.js',
  '/pf-anagrafica.js',
  '/pf-stz-core.js',
  '/pf-stz-letture.js',
  '/pf-stz-marginalita.js',
  '/pf-stz-magazzino.js',
  '/pf-stz-cassa.js',
  '/pf-stz-report.js',
  '/pf-stz-foglio.js',
  '/pf-stz-giacenze.js',
  '/pf-logistica.js',
  '/pf-admin.js',
  '/pf-dashboard.js',
  '/pf-home.js',
  '/pf-benchmark.js',
  '/pf-futures.js',
  '/pf-finanze.js',
  '/pf-allegati.js',
  '/pf-system.js',
  '/pf-push.js',
  '/pf-test.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(FILES_TO_CACHE).catch(function(err) {
        console.warn('SW: cache addAll parziale, continuo...', err);
        return Promise.all(
          FILES_TO_CACHE.map(function(url) {
            return cache.add(url).catch(function() {
              console.warn('SW: skip cache per', url);
            });
          })
        );
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  if (url.indexOf('supabase.co') >= 0 || url.indexOf('googleapis.com') >= 0 || url.indexOf('cdn') >= 0) {
    event.respondWith(
      fetch(event.request).catch(function() { return caches.match(event.request); })
    );
    return;
  }
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(r) {
        return r || new Response('Offline — ricarica quando torni online', { headers: { 'Content-Type': 'text/html' } });
      });
    })
  );
});
