import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePages } from '../scripts/prepare-pages.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'shanhe-pages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>山河志</title>');
  return directory;
}

test('preparing Pages preserves original imagery bytes and enables static delivery', async t => {
  const directory = await fixture(t);
  await mkdir(join(directory, 'images'));
  const original = Buffer.from([255, 216, 255, 0, 15, 127, 128, 255]);
  await writeFile(join(directory, 'images', 'original.jpg'), original);
  const result = await preparePages(directory);
  assert.equal(result.files, 2);
  assert.ok(result.bytes > original.length);
  assert.deepEqual(await readFile(join(directory, 'images', 'original.jpg')), original);
  assert.equal(await readFile(join(directory, '.nojekyll'), 'utf8'), '');
});

test('a nonempty HTML entry is required before publishing', async t => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'index.html'), '');
  await assert.rejects(preparePages(directory), /nonempty index/);
});

test('a file that GitHub rejects is caught before an upload', async t => {
  const directory = await fixture(t);
  const file = join(directory, 'oversized.bin');
  await writeFile(file, '');
  await truncate(file, 100 * 1024 * 1024);
  await assert.rejects(preparePages(directory), /100 MiB limit/);
});

test('combined assets exceeding the Pages limit are caught even when each file fits Git', async t => {
  const directory = await fixture(t);
  for (let n = 0; n < 10; n++) {
    const file = join(directory, `${n}.bin`);
    await writeFile(file, '');
    await truncate(file, 99 * 1024 * 1024);
  }
  await assert.rejects(preparePages(directory), /1 GB site limit/);
});

test('symlinks cannot accidentally publish files outside the build', async t => {
  const directory = await fixture(t);
  await symlink(join(directory, 'index.html'), join(directory, 'alias.html'));
  await assert.rejects(preparePages(directory), /symbolic link/);
});

test('Git metadata and dependencies cannot be included in the published artifact', async t => {
  const directory = await fixture(t);
  await mkdir(join(directory, '.git'));
  await assert.rejects(preparePages(directory), /Source directory/);
});
