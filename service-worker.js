// Service Worker mínimo: limpia cachés viejos, no intercepta fetch (evita Failed to fetch)

const SW_VERSION = '1781968087833';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// Sin listener 'fetch': el navegador carga red/CDN directamente.
