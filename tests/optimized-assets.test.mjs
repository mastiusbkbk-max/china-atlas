import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { places } from '../src/content.js';

const publicFile = path => new URL(`../public/${path.replace(/^\.?\//, '')}`, import.meta.url);
const manifest = JSON.parse(readFileSync(publicFile('/data/optimized-assets.json'), 'utf8'));

function assertWebP(path, lossless = false) {
  const bytes = readFileSync(publicFile(path));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', path);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', path);
  if (lossless) assert.ok(bytes.includes(Buffer.from('VP8L')), `${path}: DEM must use lossless WebP`);
  return bytes.length;
}

test('all destination thumbnails exist while the full-size photographs remain available', () => {
  const entries = new Map(manifest.thumbnails.entries.map(entry => [entry.source, entry]));
  for (const place of places) {
    const source = place.image.replace(/^\./, '');
    const entry = entries.get(source);
    assert.ok(entry, `${place.id}: missing optimized cover`);
    assert.equal(statSync(publicFile(source)).size, entry.sourceBytes);
    assert.equal(assertWebP(entry.optimized), entry.optimizedBytes);
    assert.equal(entry.width, 480);
  }
  assert.ok(manifest.thumbnails.optimizedBytes < manifest.thumbnails.sourceBytes * .3);
});

test('every overview DEM has a verified lossless counterpart and matching byte metadata', () => {
  assert.equal(manifest.terrain.rgbPixelsVerified, true);
  let bytes = 0;
  for (const entry of manifest.terrain.entries) {
    assert.equal(statSync(publicFile(entry.source)).size, entry.sourceBytes);
    const size = assertWebP(entry.optimized, true);
    assert.equal(size, entry.optimizedBytes);
    bytes += size;
  }
  assert.equal(manifest.terrain.entries.length, 473);
  assert.equal(bytes, manifest.terrain.optimizedBytes);
});

test('the sparse tile manifest only advertises real, uniquely named local tiles', () => {
  const detail = JSON.parse(readFileSync(publicFile('/data/tiles-detail.json'), 'utf8'));
  let total = 0;
  for (const source of ['satellite', 'terrain']) {
    assert.equal(new Set(detail[source]).size, detail[source].length);
    let bytes = 0;
    for (const key of detail[source]) {
      assert.match(key, /^\d+\/\d+\/\d+$/);
      const path = source === 'terrain' ? `/tiles/terrain-webp/${key}.webp` : `/tiles/satellite/${key}.jpg`;
      bytes += source === 'terrain' ? assertWebP(path, true) : statSync(publicFile(path)).size;
    }
    assert.equal(bytes, detail.bytes[source]);
    assert.equal(detail[source].length, detail.tiles[source]);
    total += bytes;
  }
  assert.equal(total, detail.bytes.total);
  assert.ok(total <= detail.byteLimit);
});
