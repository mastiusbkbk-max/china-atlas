import { lstat, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const siteLimit = 1_000_000_000;
const fileLimit = 100 * 1024 * 1024;

export async function preparePages(directory) {
  const root = resolve(directory);
  const index = await lstat(join(root, 'index.html'));
  if (!index.isFile() || index.size === 0) throw new Error('Pages requires a nonempty index.html');
  let bytes = 0;
  let files = 0;
  async function inspect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Pages artifact contains a symbolic link: ${file}`);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') throw new Error(`Source directory in Pages artifact: ${file}`);
        await inspect(file);
      } else if (entry.isFile()) {
        const { size } = await lstat(file);
        if (size >= fileLimit) throw new Error(`File reaches the Git 100 MiB limit: ${file}`);
        bytes += size;
        files++;
      }
    }
  }
  await inspect(root);
  if (bytes >= siteLimit) throw new Error(`Pages artifact reaches the 1 GB site limit: ${bytes} bytes`);
  await writeFile(join(root, '.nojekyll'), '');
  return { directory: root, bytes, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await preparePages(process.argv[2] || 'dist'), null, 2));
}
