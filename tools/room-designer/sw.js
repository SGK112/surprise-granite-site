/*
 * Remodely Design Pro service worker. Network-FIRST on purpose: the app
 * autodeploys, so we never want users stuck on a stale build. The cache is
 * only an offline fallback. Cross-origin (CDN, API) requests pass straight
 * through and are never cached here.
 */
const CACHE = 'remodely-v2';
const SHELL = ['./', './index.html', './aria-camera.js', './aria-voice.js',
  './manifest.webmanifest', './remodely-icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // leave CDN/API alone
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
  );
});
