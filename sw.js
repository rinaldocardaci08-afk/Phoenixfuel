const CACHE_NAME = 'phoenixfuel-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/style.css',
  '/app.js',
  '/logo_png.jpeg'
];

// Install: cache risorse base
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: pulisci cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch: network first, fallback cache
self.addEventListener('fetch', event => {
  // Non cachare le chiamate API Supabase
  if (event.request.url.includes('supabase.co')) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Salva in cache solo risposte valide
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
