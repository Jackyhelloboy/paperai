const CACHE_VERSION = 'paperai-build-' + new URL(self.location.href).searchParams.get('v') || 'dev'
const WASM_CACHE = 'paperai-wasm-v1'

const TESSERACT_URLS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm-eng.wasm',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm-hin.wasm',
  'https://tessdata.projectnaptha.com/4.0.0/hin.traineddata.gz',
  'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(WASM_CACHE).then((cache) =>
      Promise.allSettled(
        TESSERACT_URLS.map((url) =>
          cache.add(url).catch(() => {})
        )
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== WASM_CACHE && name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = request.url

  // Cache-first ONLY for Tesseract WASM and language data (immutable resources)
  if (
    url.includes('tesseract') ||
    url.includes('wasm') ||
    url.includes('traineddata') ||
    url.includes('tessdata')
  ) {
    event.respondWith(
      caches.open(WASM_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone())
            }
            return response
          }).catch(() => new Response('', { status: 503 }))
        })
      )
    )
    return
  }

  // Network-first for ALL other requests (HTML, JS, CSS, images)
  // This ensures the latest build is always served
  event.respondWith(
    fetch(request).then((response) => {
      // Cache the fresh response for offline fallback
      if (response.ok && request.url.startsWith(self.location.origin)) {
        const clone = response.clone()
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
      }
      return response
    }).catch(() => {
      // Offline fallback: serve from cache
      return caches.match(request).then((r) => r || caches.match('/'))
    })
  )
})
