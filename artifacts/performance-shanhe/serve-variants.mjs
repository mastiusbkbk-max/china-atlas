import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createStaticHandler } from './static-delivery.mjs';

const variants = process.argv.slice(2);
for (const variant of variants) {
  const [port, directory] = variant.split('=');
  const handler = await createStaticHandler({ directory: resolve(directory), base: '/china-atlas/' });
  const server = createServer((req, res) => handler(req, res).catch(() => res.destroy()));
  await new Promise(resolve => server.listen(Number(port), '127.0.0.1', resolve));
  console.log(JSON.stringify({ port: Number(port), directory: resolve(directory) }));
}
