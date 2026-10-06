// Synapz Music service worker — makes the web app installable and lets the
// shell open without a network.
//
// It caches the APP, never the MUSIC. Audio comes from Audius and YouTube and
// is streamed as it always was; nothing here stores a track.
//
// Two strategies, chosen so a deploy can never strand someone on an old build:
//
//   • Page navigations are network-first. Online, you always get the current
//     index.html (and with it the current hashed bundle names). The cached copy
//     is only a fallback for when the network is down.
//   • Hashed build assets under /assets/ are cache-first. Their file names
//     change whenever their content does, so a cached one can never be stale.
//
// Everything else — /api, /yt, the catalog JSON, and every cross-origin request
// — goes straight to the network untouched.

const VERSION = 'synapz-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Best-effort: one missing file must not block the worker installing.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Old bundles are never requested again once a deploy replaces them, but they
// would sit in the cache forever. Keep the newest entries and drop the rest.
const MAX_ASSETS = 80
async function trim(cache) {
  const keys = await cache.keys()
  const assets = keys.filter((k) => new URL(k.url).pathname.startsWith('/assets/'))
  // keys() is insertion-ordered, so the head of the list is the oldest.
  for (const k of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(k)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/yt/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Every route is the same single-page shell, so one cached copy
          // under "/" serves them all offline.
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((cache) => cache.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((cache) => cache.put(req, copy).then(() => trim(cache)))
            }
            return res
          }),
      ),
    )
  }
})
