// Gifter service worker: makes the app installable, keeps it opening without a
// connection, and receives links shared from other Android apps.

const CACHE = 'gifter-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;     // Google Sheet backend, fonts, product photos: untouched

  // "Share → Gifter" on Android posts here. Handled on the device: nothing is sent to the server.
  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

  // Network first, so a new version shows up straight away; the cached copy is the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || (request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});

async function receiveShare(request) {
  const shared = { title: '', text: '', url: '' };
  try {
    const form = await request.formData();
    for (const key of Object.keys(shared)) shared[key] = String(form.get(key) || '').slice(0, 2000);
  } catch (err) { /* nothing usable was shared: just open the app */ }
  // Passed to the page after the #, which never leaves the browser.
  const bytes = new TextEncoder().encode(JSON.stringify(shared));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const packed = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return Response.redirect('./#share=' + packed, 303);
}
