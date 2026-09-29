// Service worker Life OS: офлайн-оболочка, чтобы панель открывалась на телефоне как приложение.
// Каталог API и WebSocket намеренно НЕ кэшируем: там всегда нужны живые данные, а закэшированный
// ответ выглядел бы как «всё работает», хотя это старый снимок — худший вид поломки.
const CACHE = 'lifeos-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/mascot.svg'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return  // всегда живое
  // Статику тянем сначала из сети, при отсутствии сети — из кэша (offline-оболочка).
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  )
})
