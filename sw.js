/**
 * App-shell service worker.
 *
 * This file's job is the page itself: HTML, CSS, JavaScript, icons. The month
 * of prayer times is stored in localStorage by app.js, not here. Aladhan is a
 * different website, and mixing its responses into this cache makes it harder
 * to see which copy you are looking at.
 *
 * GitHub Pages hosts the project at /prayer-times/. A service worker only
 * controls its own folder (its "scope") unless you do extra server setup.
 * Because this file sits in that folder, ./sw.js covers the app and nothing
 * else on ashpandor.github.io.
 *
 * The first visit needs a network. After install, a later visit with no
 * signal is served from this cache.
 */

const CACHE = 'prayer-times-shell-v1';

// Paths are relative to this file, so they work at /prayer-times/ and at
// http://localhost/ during a local preview.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './lib/aladhan.js',
  './lib/places.js',
  './lib/prayer.js',
  './lib/qibla.js',
  './lib/storage.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, cache as the fallback. Online, you get updates. Offline,
  // you get the last copy that installed or loaded successfully.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw new Error('offline and not cached');
      }),
  );
});
