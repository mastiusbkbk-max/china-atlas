import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function mapEnginePreload(bundle = {}, base = '/') {
  const engine = Object.values(bundle).find(output => output.type === 'chunk' && /\/maplibre-gl\/dist\/maplibre-gl\.m?js$/.test(output.facadeModuleId || ''));
  return engine ? [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: base + engine.fileName }, injectTo: 'head' }] : [];
}

export function serviceWorkerSource({ version, dataVersion, shell, html }) {
  return `// Generated from this build; original response bytes are cached unchanged.
const VERSION = ${JSON.stringify(version)};
const DATA_VERSION = ${JSON.stringify(dataVersion)};
const SHELL = ${JSON.stringify(shell)};
const HTML = ${JSON.stringify(html)};
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
    /^(assets|data|fonts|images|tiles)\\//.test(url.pathname.slice(ROOT.pathname.length));
}
function storable(response) {
  return response.status === 200 && response.type !== 'opaque' && !response.headers.has('content-range') &&
    !/\\bno-store\\b/i.test(response.headers.get('cache-control') || '');
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
`;
}

export async function writeServiceWorker(directory, bundle) {
  const hash = createHash('sha256').update(serviceWorkerSource.toString());
  const dataHash = createHash('sha256');
  async function fingerprint(path, relative = '') {
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const name = relative + entry.name;
      if (name === 'sw.js' || name === '.nojekyll') continue;
      if (entry.isDirectory()) await fingerprint(join(path, entry.name), name + '/');
      else if (entry.isFile()) (name === 'index.html' || Object.hasOwn(bundle, name) ? hash : dataHash)
        .update(name + '\0').update(await readFile(join(path, entry.name))).update('\0');
    }
  }
  await fingerprint(directory);
  const shell = Object.keys(bundle).filter(name => /\.(?:js|mjs|css)$/.test(name)).sort();
  const version = hash.digest('hex').slice(0, 20);
  const dataVersion = dataHash.digest('hex').slice(0, 20);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  await writeFile(join(directory, 'sw.js'), serviceWorkerSource({ version, dataVersion, shell, html }));
  return { version, dataVersion, shell };
}
