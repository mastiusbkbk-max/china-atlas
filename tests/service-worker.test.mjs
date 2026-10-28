import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapEnginePreload, serviceWorkerSource, writeServiceWorker } from '../scripts/service-worker.mjs';

const scope = 'https://example.com/china-atlas/';
const config = { version: 'app-current', dataVersion: 'data-current', shell: ['assets/app.js', 'assets/map-worker.mjs'], html: '<!doctype html><title>Current build</title>' };
const key = request => typeof request === 'string' ? request : request.url;

function fixture(fetcher = async () => new Response('original')) {
  const stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(request, response) { entries.set(key(request), response.clone()); },
        async match(request) { return entries.get(key(request))?.clone(); },
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
        async delete(request) { return entries.delete(key(request)); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const events = new Map(), requests = [];
  const lifecycle = { claims: 0, skips: 0 };
  const self = {
    registration: { scope }, clients: { async claim() { lifecycle.claims++; } },
    skipWaiting() { lifecycle.skips++; },
    addEventListener(name, callback) { events.set(name, callback); }
  };
  vm.runInNewContext(serviceWorkerSource(config), { self, caches, URL, Request, Response, Set, Promise,
    fetch: async request => { requests.push(request); return fetcher(request); }
  });
  async function dispatch(name, data = {}) {
    const waits = [];
    let response;
    events.get(name)({ ...data, waitUntil(promise) { waits.push(promise); }, respondWith(promise) { response = promise; } });
    const result = response ? await response : undefined;
    await Promise.all(waits);
    return result;
  }
  return { caches, stores, requests, lifecycle, dispatch };
}

test('preload selects the engine module and respects the actual deployment base', () => {
  const bundle = {
    worker: { type: 'asset', fileName: 'assets/maplibre-gl-worker.mjs', facadeModuleId: '/maplibre-gl/dist/maplibre-gl.mjs' },
    app: { type: 'chunk', fileName: 'assets/app.js', facadeModuleId: '/src/boot.js' },
    engine: { type: 'chunk', fileName: 'assets/maplibre-gl-abcd.js', facadeModuleId: '/node_modules/maplibre-gl/dist/maplibre-gl.mjs' }
  };
  assert.deepEqual(mapEnginePreload(bundle, '/china-atlas/preview/')[0].attrs,
    { rel: 'modulepreload', crossorigin: '', href: '/china-atlas/preview/assets/maplibre-gl-abcd.js' });
  assert.deepEqual(mapEnginePreload({}, '/'), []);
});

test('fingerprints include every static original and retain the static cache across app-only updates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'shanhe-worker-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  await mkdir(join(directory, 'tiles'));
  await writeFile(join(directory, 'index.html'), config.html);
  await writeFile(join(directory, 'assets/app.js'), 'app v1');
  const original = Buffer.from([0, 255, 88, 6, 127, 128]);
  await writeFile(join(directory, 'tiles/original.webp'), original);
  const bundle = { 'assets/app.js': {}, 'index.html': {} };
  const first = await writeServiceWorker(directory, bundle);
  assert.deepEqual(await writeServiceWorker(directory, bundle), first, 'sw.js cannot invalidate its own build');
  await writeFile(join(directory, '.nojekyll'), '');
  assert.deepEqual(await writeServiceWorker(directory, bundle), first);
  await writeFile(join(directory, 'assets/app.js'), 'app v2');
  const appUpdate = await writeServiceWorker(directory, bundle);
  assert.notEqual(appUpdate.version, first.version);
  assert.equal(appUpdate.dataVersion, first.dataVersion);
  await writeFile(join(directory, 'tiles/original.webp'), Buffer.from([0, 255, 88, 7, 127, 128]));
  const dataUpdate = await writeServiceWorker(directory, bundle);
  assert.equal(dataUpdate.version, appUpdate.version);
  assert.notEqual(dataUpdate.dataVersion, appUpdate.dataVersion);
  assert.deepEqual(dataUpdate.shell, ['assets/app.js']);
  assert.match(await readFile(join(directory, 'sw.js'), 'utf8'), /Current build/);
});

test('install caches the precise embedded HTML and compiled shell without downloading tiles or replacing active tabs', async () => {
  const f = fixture(async request => {
    assert.equal(request.cache, 'force-cache');
    return new Response(new Uint8Array([0, 128, 255]), { headers: { 'content-type': 'text/javascript' } });
  });
  await f.dispatch('install');
  assert.deepEqual(f.requests.map(r => r.url), config.shell.map(path => scope + path));
  const app = await f.caches.open('shanhe-offline:/china-atlas/:app:app-current');
  assert.equal(await (await app.match(scope + 'index.html')).text(), config.html);
  assert.deepEqual([...new Uint8Array(await (await app.match(scope + config.shell[0])).arrayBuffer())], [0, 128, 255]);
  assert.equal(f.lifecycle.skips, 0);
});

test('warm root/index navigations use local HTML without a document round trip; other paths are untouched', async () => {
  let offline = false;
  const f = fixture(async () => { if (offline) throw Error('offline'); return new Response('compiled'); });
  await f.dispatch('install');
  offline = true;
  const calls = f.requests.length;
  for (const url of [scope, scope + '?utm_source=test', scope + 'index.html?test=1']) {
    const response = await f.dispatch('fetch', { request: { method: 'GET', mode: 'navigate', url, headers: new Headers() } });
    assert.equal(await response.text(), config.html);
    assert.match(response.headers.get('content-type'), /^text\/html/);
  }
  assert.equal(f.requests.length, calls);
  for (const url of [scope + 'preview/', 'https://other.example/china-atlas/', 'https://example.com/huanyou/']) {
    assert.equal(await f.dispatch('fetch', { request: { method: 'GET', mode: 'navigate', url, headers: new Headers() } }), undefined);
  }
});

test('runtime caches exact whole-response bytes and excludes ranges, failures, external URLs and no-store responses', async () => {
  let status = 200, noStore = false, contentRange = false;
  const bytes = new Uint8Array([0, 255, 128, 11, 0, 7]);
  const f = fixture(async () => new Response(bytes, { status, headers: { 'content-type': 'image/webp', ...(noStore ? { 'cache-control': 'no-store' } : {}), ...(contentRange ? { 'content-range': 'bytes 0-5/100' } : {}) } }));
  const url = scope + 'tiles/terrain-webp/4/12/6.webp';
  const response = await f.dispatch('fetch', { request: new Request(url) });
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...bytes]);
  const count = f.requests.length;
  const repeat = await f.dispatch('fetch', { request: new Request(url) });
  assert.deepEqual([...new Uint8Array(await repeat.arrayBuffer())], [...bytes]);
  assert.equal(f.requests.length, count);
  const data = await f.caches.open('shanhe-offline:/china-atlas/:data:data-current');
  for (const failedStatus of [206, 404, 500]) {
    status = failedStatus;
    const failedURL = scope + 'tiles/failure-' + status + '.webp';
    assert.equal((await f.dispatch('fetch', { request: new Request(failedURL) })).status, failedStatus);
    assert.equal(await data.match(failedURL), undefined);
  }
  status = 200; noStore = true;
  await f.dispatch('fetch', { request: new Request(scope + 'tiles/no-store.webp') });
  assert.equal(await data.match(scope + 'tiles/no-store.webp'), undefined);
  noStore = false; contentRange = true;
  await f.dispatch('fetch', { request: new Request(scope + 'tiles/partial-200.webp') });
  assert.equal(await data.match(scope + 'tiles/partial-200.webp'), undefined);
  for (const request of [new Request(url, { headers: { range: 'bytes=0-2' } }), new Request(url, { method: 'POST' }), new Request('https://upstream.example/tiles/1.webp'), new Request(scope + 'preview/tiles/1.webp')]) {
    assert.equal(await f.dispatch('fetch', { request }), undefined);
  }
});

test('warm messages deduplicate and cap allowed URLs, acknowledge after caching, and never cache failed responses', async () => {
  const f = fixture(async request => new Response('original', { status: request.url.endsWith('missing.webp') ? 404 : 200 }));
  await f.dispatch('install');
  const urls = [scope + 'tiles/missing.webp', scope + 'tiles/a.webp', scope + 'tiles/a.webp', scope + 'preview/assets/app.js', 'https://external.example/tile', 'invalid', ...Array.from({ length: 300 }, (_, i) => scope + 'tiles/' + i + '.webp')];
  let ack;
  await f.dispatch('message', { data: { type: 'CACHE_URLS', urls }, ports: [{ postMessage(value) { ack = value; } }] });
  assert.equal(ack.type, 'CACHE_READY');
  assert.equal(ack.requested, 256);
  assert.equal(ack.cached, 255);
  assert.equal(ack.version, config.version);
  assert.equal(ack.dataVersion, config.dataVersion);
  const data = await f.caches.open('shanhe-offline:/china-atlas/:data:data-current');
  assert.equal((await data.keys()).length, 255);
  assert.equal(await data.match(scope + 'tiles/missing.webp'), undefined);
  assert.equal(f.requests.filter(r => r.url.endsWith('/a.webp')).length, 1);
  const calls = f.requests.length;
  await f.dispatch('message', { data: { type: 'CACHE_URLS', urls: [scope + 'tiles/a.webp'] } });
  assert.equal(f.requests.length, calls, 'already warmed data must not be downloaded again');
});

test('activation cleans only obsolete caches in this scope and retains unchanged originals and neighboring sites', async () => {
  const f = fixture();
  for (const name of ['shanhe-offline:/china-atlas/:app:old', 'shanhe-offline:/china-atlas/:data:old', 'shanhe-offline:/china-atlas/:app:app-current', 'shanhe-offline:/china-atlas/:data:data-current', 'shanhe-offline:/china-atlas/preview/:app:preview', 'shanhe-tiles:/china-atlas/:v1']) await f.caches.open(name);
  await f.dispatch('activate');
  assert.deepEqual((await f.caches.keys()).sort(), [
    'shanhe-offline:/china-atlas/:app:app-current', 'shanhe-offline:/china-atlas/:data:data-current',
    'shanhe-offline:/china-atlas/preview/:app:preview', 'shanhe-tiles:/china-atlas/:v1'
  ].sort());
  assert.equal(f.lifecycle.claims, 1);
  assert.equal(f.lifecycle.skips, 0);
});

test('an incomplete new shell cannot install or discard an existing build', async () => {
  const f = fixture(async () => new Response('missing', { status: 404 }));
  await f.caches.open('shanhe-offline:/china-atlas/:app:old');
  await assert.rejects(f.dispatch('install'), /Unable to cache app shell/);
  assert.ok((await f.caches.keys()).includes('shanhe-offline:/china-atlas/:app:old'));
  assert.equal(f.lifecycle.skips, 0);
  assert.equal(f.lifecycle.claims, 0);
});

test('registration waits for its own scope and idle, and warms the view when ready arrives before installation', async () => {
  const source = (await readFile(new URL('../src/register-worker.js', import.meta.url), 'utf8'))
    .replaceAll('export function', 'function').replaceAll('import.meta.env', 'env');
  let idle, stateChanged, posted, mark, closed = false;
  const active = { state: 'installing', addEventListener(_type, callback) { stateChanged = callback; }, removeEventListener() {}, postMessage(value, ports) {
    posted = value;
    ports[0].receive({ data: { type: 'CACHE_READY', cached: value.urls.length, requested: value.urls.length } });
  } };
  const registration = { installing: active, active: null };
  const context = {
    env: { PROD: true, BASE_URL: '/china-atlas/' }, URL,
    location: { href: scope },
    navigator: { serviceWorker: { ready: Promise.resolve({ active: { postMessage() { throw Error('Wrong ancestor scope'); } } }),
      async register(url, options) { assert.equal(url, '/china-atlas/sw.js'); assert.equal(options.updateViaCache, 'none'); return registration; } } },
    performance: { getEntriesByType() { return [
      { name: scope + 'assets/app.js', responseEnd: 10 },
      { name: scope + 'tiles/a.webp', responseEnd: 20 },
      { name: scope + 'tiles/still-loading.webp', responseEnd: 0 },
      { name: scope + 'images/thumbs/a.webp', responseEnd: 30 },
      { name: scope + 'images/original.jpg', responseEnd: 40 },
      { name: scope + 'preview/tiles/nested.webp', responseEnd: 50 },
      { name: 'https://external.example/tiles/a.webp', responseEnd: 60 }
    ]; }, mark(name) { mark = name; } },
    MessageChannel: class { constructor() { this.port1 = { close() { closed = true; } }; this.port2 = { receive: data => this.port1.onmessage(data) }; } },
    requestIdleCallback(callback) { idle = callback; }, window: { requestIdleCallback() {} }, setTimeout
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.api = { registerAtlasWorker, warmAtlasResources };', context);
  context.api.registerAtlasWorker();
  assert.equal(posted, undefined);
  context.api.warmAtlasResources();
  const started = idle();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posted, undefined);
  assert.equal(typeof stateChanged, 'function');
  registration.active = active;
  active.state = 'activated';
  stateChanged();
  await started;
  assert.deepEqual([...posted.urls], [scope + 'assets/app.js', scope + 'tiles/a.webp', scope + 'images/thumbs/a.webp']);
  assert.equal(mark, 'atlas-cache-ready');
  assert.ok(closed);
  context.api.warmAtlasResources();
  context.api.registerAtlasWorker();
});
