/*
 * Synapz app-shell service worker.
 *
 * Its job is to make Synapz a real installable PWA (so you can "Add to Home
 * Screen" and run it like a native app — which gives the most reliable
 * background audio on Android) and to load the shell instantly / offline.
 *
 * It deliberately NEVER touches audio streams, API calls, or any cross-origin
 * request (YouTube, Audius, googlevideo) — those must always hit the network.
 */
const CACHE = 'synapz-shell-v1'
const SHELL = ['/', '/index.html', '/icon.svg', '/logo.svg', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Only ever handle same-origin requests. Audio/CDN/API traffic is left alone.
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/yt')) return

  // Navigations: network-first so a new deploy is picked up, fall back to the
  // cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }

  // Static assets (Vite emits content-hashed filenames, so cache-first is safe):
  // serve from cache, otherwise fetch and stash a copy for next time / offline.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
