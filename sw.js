// Network-first service worker: the newest app code is always used when online; the cached copy opens the shell offline.
const CACHE = 'gyl-shell-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/core.js', 'js/auth.js', 'js/client.js', 'js/cases.js', 'js/chat.js', 'js/account.js', 'js/lawyer.js', 'js/main.js', 'libs/leaflet/leaflet.js', 'libs/leaflet/leaflet.css', 'icon.svg', 'manifest.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin')) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
