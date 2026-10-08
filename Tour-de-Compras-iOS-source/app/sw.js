/**
 * sw.js — Service worker.
 *
 * Su único trabajo en la etapa 1 es que la app abra sin conexión: guarda el
 * shell (html, css, js) en caché la primera vez y después lo sirve desde ahí.
 * Los datos no pasan por acá: viven en IndexedDB.
 *
 * Al publicar una versión nueva, subir CACHE_VERSION.
 */

const CACHE_VERSION = 'tc-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icono.svg',
  './js/app.js',
  './js/db.js',
  './js/model.js',
  './js/media.js',
  './js/sync.js',
  './js/config.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // el servidor propio no se cachea

  e.respondWith(
    caches.match(req).then((cacheada) => {
      if (cacheada) {
        // Refresca en segundo plano, pero responde ya.
        fetch(req).then((r) => {
          if (r && r.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, r.clone()));
        }).catch(() => {});
        return cacheada;
      }
      return fetch(req).then((r) => {
        if (r && r.ok) {
          const copia = r.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copia));
        }
        return r;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
