// Phoenix Fuel Service Worker
// STRATEGIA:
// - File con ?v=... (JS/CSS versionati) → network first sempre, cache solo come fallback offline
// - File statici senza versione (HTML, icone) → cache first con refresh in background
// - API supabase/google → solo network, mai cache
// ═══════════════════════════════════════════════════════════════════

var CACHE_NAME = 'phoenixfuel-v32';
var FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/login.html',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        FILES_TO_CACHE.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
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

  // API esterne: sempre network
  if (url.indexOf('supabase.co') >= 0 || url.indexOf('googleapis.com') >= 0 || url.indexOf('cdn') >= 0) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // File versionati (?v=...): SEMPRE dalla rete, cache solo in caso di offline totale.
  // Non salviamo in cache perché il versioning garantisce che il browser
  // veda nomi diversi a ogni deploy → la cache vecchia viene ignorata automaticamente.
  if (url.indexOf('?v=') >= 0) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request) || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Altri file statici (HTML, icone, ecc): cache first con refresh in background
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var fetchPromise = fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return cached || new Response('Offline — ricarica quando torni online', {
          headers: { 'Content-Type': 'text/html' }
        });
      });
      // Restituisce cache se presente, ma aggiorna in background
      return cached || fetchPromise;
    })
  );
});

// Messaggio dalla pagina per forzare skipWaiting quando si rileva una nuova versione
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
