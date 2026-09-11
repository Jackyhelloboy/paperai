const CACHE_NAME = 'paperai-v2'
const WASM_CACHE = 'paperai-wasm-v2'

// Tesseract CDN URLs for offline caching
const TESSERACT_URLS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm-eng.wasm',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm-hin.wasm',
  'https://tessdata.projectnaptha.com/4.0.0/hin.traineddata.gz',
  'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
]

const PRECACHE_URLS = [
  '/',
  '/about',
  '/features',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  // Also start caching Tesseract assets
  event.waitUntil(
    caches.open(WASM_CACHE).then((cache) =>
      Promise.allSettled(
        TESSERACT_URLS.map((url) =>
          cache.add(url).catch(() => {
            // Some URLs may not exist, that's OK
          })
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
          .filter((name) => name !== CACHE_NAME && name !== WASM_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = request.url

  // Cache-first for Tesseract WASM and language data
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

  // Network-first for navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return response
      }).catch(() =>
        caches.match(request).then((r) => r || caches.match('/'))
      )
    )
    return
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      }).catch(() => new Response('', { status: 503 }))
    })
  )
})
