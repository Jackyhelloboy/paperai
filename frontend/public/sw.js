const CACHE_NAME = 'paperai-v4'
const OCR_CACHE = 'paperai-ocr-v4'

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
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== OCR_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = request.url

  // Cache OCR model/runtime assets aggressively. We no longer pre-cache a
  // hard-coded tesseract.js-core version because the npm package may request a
  // different WASM build. Whatever the current app requests is cached here.
  if (
    url.includes('tesseract') ||
    url.includes('traineddata') ||
    url.includes('tessdata') ||
    url.endsWith('.wasm') ||
    url.endsWith('.wasm.js')
  ) {
    event.respondWith(
      caches.open(OCR_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached

        try {
          const response = await fetch(request)
          if (response.ok) cache.put(request, response.clone())
          return response
        } catch {
          return new Response('', { status: 503 })
        }
      })
    )
    return
  }

  // Network-first for navigations and same-origin JS/CSS/static files. This
  // prevents an old service-worker cache from keeping a previous OCR bundle
  // alive after a new GitHub/Vercel deployment.
  if (
    request.mode === 'navigate' ||
    (request.url.startsWith(self.location.origin) &&
      ['script', 'style', 'document'].includes(request.destination))
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    )
    return
  }

  // Other same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      const networkPromise = fetch(request)
        .then((response) => {
          if (response.ok && request.url.startsWith(self.location.origin)) {
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(() => null)

      if (cached) {
        networkPromise.catch(() => null)
        return cached
      }

      const network = await networkPromise
      return network || new Response('', { status: 503 })
    })
  )
})
