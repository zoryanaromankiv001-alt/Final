/**
 * ColonyVision Lab: Progressive Web App Service Worker
 * Author: Zoryana Pihach Romankiv (CAI 2840 - Introduction to Computer Vision)
 *
 * Implements Slide 9: "Zero processing servers. Service Worker + Cache API. Cache first; then reopen offline."
 */

const CACHE_NAME = 'colonyvision-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './how-it-works.html',
  './resources.html',
  './guide/index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/pipeline.js',
  './js/vision-client.js',
  './vision.worker.js',
  './samples/bacterial-plate.jpg',
  './samples/staph-blood-agar.jpg',
  './samples/yeast-cell-culture.jpg',
  './samples/ground-truth.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Cache first, fall back to network
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        // Cache fetched vendor assets like opencv.js for offline reuse
        if (response.ok && e.request.url.includes('/vendor/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
