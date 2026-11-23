/* Service worker: lets the portal open (and say it is offline) without a connection.
 *
 * What it keeps: the app shell (index.html, the hashed JS/CSS under /assets/, the icons).
 * What it never touches: the API. Anything under /api/ and anything on another origin (the deployed API
 * lives on its own domain) goes straight to the network, so records, sign-in tokens and another user's
 * data are never stored or shown stale.
 *
 * Updates: the build-id placeholder on the VERSION line is replaced at build time with a hash of index.html,
 * so every deploy gets its own cache. A new worker waits until the old one's tabs are closed instead of
 * taking over at once, then deletes the old caches, so a tab never mixes files from two versions.
 */
const VERSION = '__BUILD_ID__';
const CACHE = `shell-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Keep the scripts and styles the shell points at, so the first offline visit works too.
    try {
      const html = await (await fetch('/index.html', { cache: 'reload' })).text();
      const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
      await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
    } catch { /* offline during install: the shell alone is still cached */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('shell-') && key !== CACHE) await caches.delete(key);
  })());
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

async function navigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    // every route serves the same single-page shell, so one copy covers them all
    if (response.ok) cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('/index.html')) ?? (await cache.match('/')) ?? Response.error();
  }
}

async function hashedAsset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the API and fonts: not ours
  if (url.pathname.startsWith('/api/')) return; // same-origin API (dev proxy): never cached
  if (request.mode === 'navigate') event.respondWith(navigation(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(hashedAsset(request));
});
