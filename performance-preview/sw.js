// Generated from this build; original response bytes are cached unchanged.
const VERSION = "13a8d9def5ea91abf4a5";
const DATA_VERSION = "65e228a5d2f5627ca5f3";
const SHELL = ["assets/index-BkNyuSOm.js","assets/index-C_0dD3VJ.css","assets/maplibre-gl-Y_FXurWg.js","assets/maplibre-gl-worker-BrB25tGK.mjs"];
const HTML = "<!doctype html>\n<html lang=\"zh-CN\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta name=\"theme-color\" content=\"#101b1e\" />\n    <meta name=\"description\" content=\"山河志，一部可以走进的中国地理图鉴。探索真实三维地形，穿越高山、大河与千年文明。\" />\n    <title>山河志 — 看见中国的辽阔</title>\n    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/china-atlas/performance-preview/favicon.svg\" />\n    <link rel=\"preconnect\" href=\"https://server.arcgisonline.com\" crossorigin />\n    <link rel=\"preconnect\" href=\"https://s3.amazonaws.com\" crossorigin />\n    <script type=\"module\" crossorigin src=\"/china-atlas/performance-preview/assets/index-BkNyuSOm.js\"></script>\n    <link rel=\"stylesheet\" crossorigin href=\"/china-atlas/performance-preview/assets/index-C_0dD3VJ.css\">\n    <link rel=\"modulepreload\" crossorigin=\"\" href=\"/china-atlas/performance-preview/assets/maplibre-gl-Y_FXurWg.js\">\n  </head>\n  <body>\n    <div id=\"app\"></div>\n  </body>\n</html>\n";
const ROOT = new URL(self.registration.scope);
const PREFIX = 'shanhe-offline:' + ROOT.pathname + ':';
const APP_CACHE = PREFIX + 'app:' + VERSION;
const DATA_CACHE = PREFIX + 'data:' + DATA_VERSION;
const INDEX = new URL('index.html', ROOT).href;
const protectedURLs = new Set([INDEX, ...SHELL.map(path => new URL(path, ROOT).href)]);
const opened = url => caches.open(url === INDEX || new URL(url).pathname.startsWith(ROOT.pathname + 'assets/') ? APP_CACHE : DATA_CACHE);
let writes = Promise.resolve();
let writesSinceTrim = 0;

function allowed(url) {
  return url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname) &&
    /^(assets|data|fonts|images|tiles)\//.test(url.pathname.slice(ROOT.pathname.length));
}
function storable(response) {
  return response.status === 200 && response.type !== 'opaque' && !response.headers.has('content-range') &&
    !/\bno-store\b/i.test(response.headers.get('cache-control') || '');
}
function remember(request, response) {
  writes = writes.catch(() => {}).then(async () => {
    const url = typeof request === 'string' ? request : request.url;
    const cache = await opened(url);
    await cache.put(request, response);
    if (url === INDEX || new URL(url).pathname.startsWith(ROOT.pathname + 'assets/')) return;
    if (++writesSinceTrim < 16) return;
    writesSinceTrim = 0;
    const keys = await cache.keys();
    let excess = keys.length - 512;
    for (const key of keys) {
      if (excess <= 0) break;
      if (!protectedURLs.has(key.url)) { await cache.delete(key); excess--; }
    }
  });
  return writes;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.put(INDEX, new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    await Promise.all(SHELL.map(async path => {
      const request = new Request(new URL(path, ROOT), { cache: 'force-cache' });
      const response = await fetch(request);
      if (!storable(response)) throw Error('Unable to cache app shell: ' + path);
      await cache.put(request, response);
    }));
  })());
  // Let existing tabs finish with their current build before activating an update.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(name => name.startsWith(PREFIX) && name !== APP_CACHE && name !== DATA_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('range') || url.origin !== ROOT.origin) return;
  const navigation = request.mode === 'navigate' && (url.pathname === ROOT.pathname || url.pathname === ROOT.pathname + 'index.html');
  if (!navigation && !allowed(url)) return;
  let saving = Promise.resolve();
  const response = (async () => {
    let cached;
    try { cached = await (await opened(navigation ? INDEX : url.href)).match(navigation ? INDEX : request); } catch {}
    if (cached) return cached;
    const fresh = await fetch(request);
    if (!navigation && storable(fresh)) saving = remember(request, fresh.clone()).catch(() => {});
    return fresh;
  })();
  event.respondWith(response);
  event.waitUntil(response.then(() => saving).catch(() => {}));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)].filter(value => {
    try { return allowed(new URL(value)); } catch { return false; }
  }).slice(0, 256);
  event.waitUntil((async () => {
    let cached = 0;
    const pending = [...urls];
    const warm = async () => {
      while (pending.length) {
        const url = pending.shift();
        try {
          if (!await (await opened(url)).match(url)) {
            const response = await fetch(new Request(url, { cache: 'force-cache', priority: 'low' }));
            if (!storable(response)) continue;
            await remember(url, response);
          }
          cached++;
        } catch {}
      }
    };
    await Promise.all([warm(), warm()]);
    event.ports?.[0]?.postMessage({ type: 'CACHE_READY', version: VERSION, dataVersion: DATA_VERSION, cached, requested: urls.length });
  })());
});
