var CACHE_NAME = 'phoenixfuel-v5';
var APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/style.css',
  '/pf-config.js',
  '/pf-ordini.js',
  '/pf-deposito.js',
  '/pf-anagrafica.js',
  '/pf-stazione.js',
  '/pf-logistica.js',
  '/pf-admin.js',
  '/pf-dashboard.js',
  '/pf-benchmark.js',
  '/pf-finanze.js',
  '/pf-system.js',
  '/manifest.json'
];
var CDN_CACHE = 'phoenixfuel-cdn-v5';
var CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js@4',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(APP_SHELL); }),
      caches.open(CDN_CACHE).then(function(cache) { return cache.addAll(CDN_URLS); })
    ]).then(function() { self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME && n !== CDN_CACHE; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(resp) {
          var clone = resp.clone();
          caches.open(CDN_CACHE).then(function(c) { c.put(e.request, clone); });
          return resp;
        });
      })
    );
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        if (resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }
});
