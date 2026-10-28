import { defineConfig } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { mapEnginePreload, writeServiceWorker } from './scripts/service-worker.mjs';
let dataDirectory;
let siteBase;

// base 与 GitHub Pages 子路径对应，使资源引用正确指向站点根
export default defineConfig({
  base: '/china-atlas/',
  plugins: [{
    name: 'compact-static-data',
    apply: 'build',
    configResolved(config) { dataDirectory = resolve(config.root, config.build.outDir, 'data'); siteBase = config.base; },
    transformIndexHtml: { order: 'post', handler(_html, context) { return mapEnginePreload(context.bundle, siteBase); } },
    async writeBundle(_options, bundle) {
      await Promise.all((await readdir(dataDirectory)).filter(name => /\.(geojson|json)$/.test(name)).map(async name => {
        const file = join(dataDirectory, name);
        await writeFile(file, JSON.stringify(JSON.parse(await readFile(file, 'utf8'))));
      }));
      await writeServiceWorker(resolve(dataDirectory, '..'), bundle);
    }
  }],
});
