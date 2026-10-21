import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const dataDir = join(publicDir, 'data');
const tileBounds = [55, -20, 180, 70];
const satellite = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const terrain = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const relief = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}';
const providers = [
  { id: 'satellite', url: satellite, extension: 'jpg' },
  { id: 'terrain', url: terrain, extension: 'png' },
  { id: 'relief', url: relief, extension: 'jpg' },
];

await mkdir(dataDir, { recursive: true });

async function download(url, destination) {
  try {
    if ((await stat(destination)).size > 0) return;
  } catch {}
  await mkdir(dirname(destination), { recursive: true });
  await run('curl', ['--fail', '--silent', '--show-error', '--max-time', '25', '--retry', '2', '--output', destination, url]);
}

await Promise.all([
  download('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json', join(dataDir, 'china-provinces.geojson')),
  download('https://geo.datav.aliyun.com/areas_v3/bound/100000.json', join(dataDir, 'china-outline.geojson')),
]);

const xTile = (longitude, z) => Math.min(2 ** z - 1, Math.max(0, Math.floor(((longitude + 180) / 360) * 2 ** z)));
const yTile = (latitude, z) => Math.floor((1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
const tasks = [];
for (const provider of providers) {
  for (let z = 0; z <= 5; z++) {
    const [west, south, east, north] = tileBounds;
    const xMin = z <= 4 ? 0 : xTile(west, z);
    const xMax = z <= 4 ? 2 ** z - 1 : xTile(east, z);
    const yMin = z <= 4 ? 0 : yTile(north, z);
    const yMax = z <= 4 ? 2 ** z - 1 : yTile(south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const url = provider.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        const path = join(publicDir, 'tiles', provider.id, String(z), String(x), `${y}.${provider.extension}`);
        tasks.push({ provider: provider.id, z, x, y, url, path });
      }
    }
  }
}
let cursor = 0;
let complete = 0;
const errors = [];
await Promise.all(Array.from({ length: 12 }, async () => {
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    try { await download(task.url, task.path); }
    catch (error) { errors.push({ url: task.url, message: error.message }); }
    complete++;
    if (complete % 30 === 0) console.log(`Cached ${complete}/${tasks.length}`);
  }
}));

const provinces = JSON.parse(await readFile(join(dataDir, 'china-provinces.geojson'), 'utf8'));
const outline = JSON.parse(await readFile(join(dataDir, 'china-outline.geojson'), 'utf8'));
let tileBytes = 0;
let tileCount = 0;
const sourceStats = {};
for (const provider of providers) {
  const folder = join(publicDir, 'tiles', provider.id);
  const files = (await readdir(folder, { recursive: true })).filter(file => file.endsWith(`.${provider.extension}`));
  const bytes = (await Promise.all(files.map(file => stat(join(folder, file))))).reduce((sum, file) => sum + file.size, 0);
  sourceStats[provider.id] = { tiles: files.length, bytes };
  tileCount += files.length;
  tileBytes += bytes;
}
const manifest = {
  title: '中国地理交互图集 · 地图数据来源',
  retrievedAt: new Date().toISOString(),
  coordinateReferenceSystem: 'GeoJSON longitude/latitude; tiles Web Mercator EPSG:3857',
  boundaries: {
    provider: '阿里云 DataV.GeoAtlas',
    homepage: 'https://datav.aliyun.com/portal/school/atlas/area_selector',
    provinces: { url: 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json', local: '/data/china-provinces.geojson', features: provinces.features.length },
    outline: { url: 'https://geo.datav.aliyun.com/areas_v3/bound/100000.json', local: '/data/china-outline.geojson', features: outline.features.length },
    note: '保留原始数据全部几何，包括台湾、香港、澳门、海南及南海相关几何。边界显示仅供地理科普参考，不作为测绘或法律依据。',
  },
  satellite: {
    provider: 'Esri World Imagery',
    url: satellite,
    local: '/tiles/satellite/{z}/{x}/{y}.jpg',
    tileSize: 256,
    attribution: 'Tiles © Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    metadata: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson',
  },
  terrain: {
    provider: 'AWS Terrain Tiles',
    url: terrain,
    local: '/tiles/terrain/{z}/{x}/{y}.png',
    tileSize: 256,
    encoding: 'terrarium',
    decodeMeters: '(R * 256 + G + B / 256) - 32768',
    attribution: 'Terrain tiles © Mapzen / Tilezen, elevation data from multiple public sources',
    documentation: 'https://registry.opendata.aws/terrain-tiles/',
  },
  relief: {
    provider: 'Esri World Shaded Relief',
    url: relief,
    local: '/tiles/relief/{z}/{x}/{y}.jpg',
    tileSize: 256,
    attribution: 'Tiles © Esri — Source: Esri',
    metadata: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer?f=pjson',
  },
  cache: { globalZooms: [0, 1, 2, 3, 4], asiaZooms: [5], asiaBounds: tileBounds, tiles: tileCount, bytes: tileBytes, sources: sourceStats, errors },
};
const previousManifest = JSON.parse(await readFile(join(dataDir, 'map-sources.json'), 'utf8').catch(() => '{}'));
if (previousManifest.geographicLayers) manifest.geographicLayers = previousManifest.geographicLayers;
await writeFile(join(dataDir, 'map-sources.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ tiles: tileCount, tileBytes, sources: sourceStats, provinces: provinces.features.map(feature => feature.properties.name), outlineTypes: outline.features.map(feature => feature.geometry.type), errors }, null, 2));
if (tileBytes > 30_000_000) console.warn('Cache exceeds 30MB target.');
if (errors.length) process.exitCode = 1;
