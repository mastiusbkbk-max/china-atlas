import test from 'node:test';
import assert from 'node:assert/strict';
import { installTileProtocol } from '../src/map-tiles.js';

function fixture(fetch, options = {}) {
  const images = [];
  class LocalImage {
    constructor() { images.push(this); }
  }
  let handler;
  installTileProtocol({ addProtocol(name, callback) { handler = callback; } }, {
    Image: LocalImage, fetch, cacheStorage: null,
    baseURL: 'https://example.com/china-atlas/', ...options
  });
  return { images, handler };
}
const tile = source => ({ url: `atlas://${source}/4/12/6` });
const response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });

test('local JPEGs retain stable URLs and return browser images while DEM stays encoded', async () => {
  const requests = [];
  const { images, handler } = fixture(async url => { requests.push(url); return response(); });
  for (const source of ['satellite', 'relief']) {
    const controller = new AbortController();
    const loaded = handler(tile(source), controller);
    const image = images.at(-1);
    const url = `https://example.com/china-atlas/tiles/${source}/4/12/6.jpg`;
    assert.equal(image.src, url);
    image.onload();
    assert.equal((await loaded).data, image);
    controller.abort();
    assert.equal(image.src, url, 'successful images must remain available for texture upload');
    assert.equal(image.onload, null);
    assert.equal(image.onerror, null);
  }
  const dem = await handler(tile('terrain'), new AbortController());
  assert.ok(dem.data instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(dem.data)], [1, 2, 3]);
  assert.deepEqual(requests, ['https://example.com/china-atlas/tiles/terrain-webp/4/12/6.webp']);
  assert.equal(images.length, 2);
});

test('cancelling a local image does not cancel another consumer or trigger remote fallback', async () => {
  const requests = [];
  const { images, handler } = fixture(async url => { requests.push(url); return response(); });
  const firstController = new AbortController();
  const first = handler(tile('satellite'), firstController);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  const second = handler(tile('satellite'), new AbortController());
  firstController.abort();
  await cancelled;
  assert.equal(images[0].src, '');
  assert.equal(images[0].onload, null);
  assert.ok(images[1].src.endsWith('/4/12/6.jpg'));
  images[1].onload();
  assert.equal((await second).data, images[1]);
  assert.deepEqual(requests, []);
});

test('failed local images fall back directly to the original remote without a second local request', async () => {
  const requests = [];
  const { images, handler } = fixture(async url => { requests.push(url); return response(); });
  const loaded = handler(tile('satellite'), new AbortController());
  images[0].onerror();
  assert.deepEqual([...new Uint8Array((await loaded).data)], [1, 2, 3]);
  assert.deepEqual(requests, ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/12']);
  assert.equal(images[0].onerror, null);
});

test('stalled local images time out and release their handlers before remote fallback', async () => {
  const requests = [];
  const { images, handler } = fixture(async url => { requests.push(url); return response(); }, { timeoutMs: 5 });
  const loaded = handler(tile('satellite'), new AbortController());
  assert.equal((await loaded).data.byteLength, 3);
  assert.equal(images[0].src, '');
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
  assert.equal(requests.length, 1);
});

test('an already cancelled local image request allocates no image and makes no request', async () => {
  const { images, handler } = fixture(() => { throw Error('unexpected request'); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(handler(tile('satellite'), controller), { name: 'AbortError' });
  assert.equal(images.length, 0);
});
