/* Flow service worker — offline app shell.
   Pages: network first (so updates show up), fall back to cache offline.
   Icons/images: cache first. Never touches requests to Google (sync).
   Keep CACHE in step with APP_VERSION in index.html. */
const CACHE = 'flow-v2.2.0';
const SHELL = ['index.html', 'about/index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

/* One cache entry per page: drop the query string (?tab=plan …) and map
   folder URLs to their index.html, so "./", "index.html" and "./?tab=close"
   all share a single stored copy. */
const SCOPE = new URL('./', self.location).pathname;
function pageKey(url) {
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  return new URL(path, url.origin).href;
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('flow-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Google Apps Script etc. go straight to the network

  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    const key = pageKey(url);
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key).then(r => r || caches.match(SCOPE + 'index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && /\.(png|svg|json|webp|ico)$/.test(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
