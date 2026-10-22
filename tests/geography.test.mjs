import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { places, chapters, themes, highlights, provinceNames } from '../src/content.js';
import { placeStories } from '../src/place-stories.js';

const readData = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const photoSources = readData('photo-sources.json');
const provinces = readData('china-provinces.geojson');
const outline = readData('china-outline.geojson');
const rivers = readData('rivers.geojson');
const mountains = readData('mountains.geojson');

function assertChinaPosition(position, label) {
  assert.ok(Array.isArray(position) && position.length === 2, `${label}: expected [longitude, latitude]`);
  const [longitude, latitude] = position;
  assert.ok(Number.isFinite(longitude) && Number.isFinite(latitude), `${label}: coordinates must be finite`);
  assert.ok(longitude >= 73 && longitude <= 135, `${label}: longitude outside China overview bounds`);
  assert.ok(latitude >= 18 && latitude <= 54, `${label}: latitude outside China overview bounds`);
}

function ringContains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function geometryContains(geometry, position) {
  assert.ok(['Polygon', 'MultiPolygon'].includes(geometry.type), 'National outline must contain polygon geometry');
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => ringContains(outer, position) && !holes.some((hole) => ringContains(hole, position)));
}

function linePositions(feature) {
  const { type, coordinates } = feature.geometry;
  assert.ok(['LineString', 'MultiLineString'].includes(type), `${feature.properties.name}: expected line geometry`);
  const lines = type === 'LineString' ? [coordinates] : coordinates;
  assert.ok(lines.length > 0 && lines.every(line => line.length >= 2), `${feature.properties.name}: incomplete line`);
  return lines.flat();
}

function assertInBounds(position, bounds, label) {
  assert.ok(Array.isArray(position) && position.length === 2 && position.every(Number.isFinite), `${label}: invalid longitude/latitude`);
  const [x, y] = position;
  assert.ok(x >= bounds[0] && y >= bounds[1] && x <= bounds[2] && y <= bounds[3], `${label}: coordinate outside documented bounds`);
}

function assertReference(url, label) {
  const parsed = new URL(url);
  assert.ok(['http:', 'https:'].includes(parsed.protocol), `${label}: invalid source protocol`);
  assert.ok(parsed.hostname.includes('.') && parsed.pathname !== '/', `${label}: cite a specific reference`);
}

test('the atlas has 81 distinct destinations with usable WGS84 positions', () => {
  assert.equal(places.length, 81);
  assert.equal(new Set(places.map((place) => place.id)).size, 81, 'Destination IDs must be unique');
  for (const place of places) {
    assert.ok(typeof place.id === 'string' && place.id.trim(), 'Every destination needs an ID');
    assertChinaPosition(place.coordinate, place.id);
  }
});

test('the catalog covers all 34 regions and all eight themes with complete reading material', () => {
  assert.equal(provinceNames.length, 34);
  assert.equal(themes.length, 8);
  assert.deepEqual(new Set(places.map(p => p.province)), new Set(provinceNames));
  assert.deepEqual(new Set(places.map(p => p.theme)), new Set(themes.map(t => t.id)));
  for (const p of places) {
    assert.ok(['nature', 'culture'].includes(p.category), `${p.id}: missing category`);
    for (const key of ['name', 'en', 'region', 'kicker', 'title', 'description']) assert.ok(p[key]?.trim(), `${p.id}: missing ${key}`);
    assert.equal(p.paragraphs.length, 2, `${p.id}: needs geography and cultural/ecological context`);
    assert.ok(p.paragraphs.every(text => text.length >= 45), `${p.id}: incomplete reading material`);
    assert.equal(p.stats.length, 3, `${p.id}: incomplete facts`);
    assert.ok(p.stats.every(s => s.value && s.label), `${p.id}: missing fact labels`);
    assert.ok(p.tags.length >= 3, `${p.id}: insufficient search tags`);
    assert.ok(Array.isArray(p.aliases), `${p.id}: missing alias list`);
    assert.ok(['https:', 'http:'].includes(new URL(p.source.url).protocol), `${p.id}: invalid reference URL`);
  }
});

test('the introductory journey stays at twelve curated stops and all twelve topics have valid routes', () => {
  assert.equal(chapters.length, 12);
  assert.equal(highlights.length, 12);
  assert.equal(new Set(highlights).size, highlights.length);
  assert.ok(highlights.every(id => places.some(p => p.id === id)));
  assert.ok(highlights.length * 11 <= 140, 'The advertised introductory tour must stay around two minutes');
  assert.equal(new Set(chapters.map(c => c.id)).size, chapters.length);
  assert.ok(chapters.every(c => c.en && c.number && c.intro));
});

test('every chapter references existing destinations and every destination is discoverable', () => {
  const ids = new Set(places.map((place) => place.id));
  const referenced = new Set();
  assert.ok(chapters.length > 0);
  for (const chapter of chapters) {
    assert.ok(chapter.placeIds.length > 0, `${chapter.id}: chapter needs destinations`);
    for (const id of chapter.placeIds) {
      assert.ok(ids.has(id), `${chapter.id}: unknown destination ${id}`);
      referenced.add(id);
    }
  }
  assert.deepEqual(referenced, ids, 'A destination should not be omitted from every chapter');
});

test('destination photographs have traceable attribution and real local JPEG files', () => {
  for (const place of places) {
    const photo = photoSources[place.id];
    assert.ok(photo, `${place.id}: missing photography source`);
    for (const key of ['author', 'license', 'sourceUrl', 'licenseUrl']) {
      assert.ok(typeof photo[key] === 'string' && photo[key].trim(), `${place.id}: missing ${key}`);
    }
    for (const key of ['sourceUrl', 'licenseUrl']) {
      assert.ok(['https:', 'http:'].includes(new URL(photo[key]).protocol), `${place.id}: invalid ${key}`);
    }
    assert.equal(photo.file.replace(/^\./, ''), place.image.replace(/^\./, ''), `${place.id}: displayed image must match the credited file`);
    assert.match(photo.file, /^\/images\/[a-z-]+\.jpg$/);
    const bytes = readFileSync(new URL(`../public${photo.file}`, import.meta.url));
    assert.ok(bytes.length > 0, `${place.id}: empty photograph`);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${place.id}: file is not a JPEG`);
  }
});

test('every place has specific reading chapters and an observation passage', () => {
  assert.deepEqual(new Set(Object.keys(placeStories)), new Set(places.map(p => p.id)));
  for (const p of places) {
    const story = placeStories[p.id];
    assert.equal(story.chapterTitles.length, p.paragraphs.length, `${p.id}: missing chapter titles`);
    assert.ok(story.chapterTitles.every(title => typeof title === 'string' && title.trim().length >= 4), `${p.id}: incomplete titles`);
    assert.equal(new Set(story.chapterTitles).size, 2, `${p.id}: duplicate chapter titles`);
    assert.ok(story.observation.length >= 70 && story.observation.length <= 110, `${p.id}: observation needs 70–110 characters`);
  }
});

test('each place has an additional, distinct, captioned and licensed local image', () => {
  const details = [...readData('detail-photos-nature.json'), ...readData('detail-photos-culture.json')];
  assert.equal(details.length, places.length);
  assert.deepEqual(new Set(details.map(photo => photo.id)), new Set(places.map(p => p.id)));
  for (const photo of details) {
    for (const key of ['caption', 'alt', 'author', 'license', 'sourceUrl', 'licenseUrl']) assert.ok(typeof photo[key] === 'string' && photo[key].trim(), `${photo.id}: missing ${key}`);
    assert.match(photo.file, /^\/images\/details\/[a-z-]+\.jpg$/);
    assertReference(photo.sourceUrl, photo.id);
    assert.ok(['https:', 'http:'].includes(new URL(photo.licenseUrl).protocol), `${photo.id}: invalid license URL`);
    assert.notEqual(decodeURI(photo.sourceUrl), decodeURI(photoSources[photo.id].sourceUrl), `${photo.id}: second photograph repeats the cover`);
    const bytes = readFileSync(new URL(`../public${photo.file}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${photo.id}: invalid JPEG`);
    assert.equal(bytes.length, photo.bytes, `${photo.id}: metadata does not match the file`);
    assert.ok(photo.width > 0 && photo.height > 0, `${photo.id}: missing photograph dimensions`);
    assert.notDeepEqual(bytes, readFileSync(new URL(`../public${photoSources[photo.id].file}`, import.meta.url)), `${photo.id}: identical cover and detail image`);
  }
});

test('administrative boundaries contain all 34 province-level regions', () => {
  const provinceFeatures = provinces.features.filter((feature) => feature.properties.adcode !== '100000_JD');
  const expectedCodes = [
    110000, 120000, 130000, 140000, 150000, 210000, 220000, 230000,
    310000, 320000, 330000, 340000, 350000, 360000, 370000, 410000,
    420000, 430000, 440000, 450000, 460000, 500000, 510000, 520000,
    530000, 540000, 610000, 620000, 630000, 640000, 650000, 710000,
    810000, 820000,
  ];
  assert.equal(provinceFeatures.length, 34);
  assert.deepEqual(provinceFeatures.map((feature) => feature.properties.adcode).sort((a, b) => a - b), expectedCodes);
  for (const name of ['台湾省', '香港特别行政区', '澳门特别行政区', '海南省']) {
    const feature = provinceFeatures.find((item) => item.properties.name === name);
    assert.ok(feature, `${name}: missing administrative boundary`);
    assert.ok(feature.geometry.coordinates.length > 0, `${name}: empty boundary geometry`);
  }
});

test('the national outline includes land in Taiwan, Hong Kong, Macau and Hainan', () => {
  const positions = {
    台湾: [121, 23.7],
    香港: [114.16, 22.28],
    澳门: [113.55, 22.2],
    海南: [109.7, 19.2],
  };
  for (const [name, position] of Object.entries(positions)) {
    assert.ok(outline.features.some((feature) => geometryContains(feature.geometry, position)), `${name}: absent from national outline`);
  }
});

test('major mountain ranges disclose schematic geometry and provide usable geography references', () => {
  assert.equal(mountains.type, 'FeatureCollection');
  assert.equal(new Set(mountains.features.map(feature => feature.properties.id)).size, mountains.features.length);
  const named = new Map(mountains.features.map(feature => [feature.properties.name, feature]));
  for (const name of ['喜马拉雅山脉', '昆仑山脉', '天山山脉', '秦岭', '横断山系', '大兴安岭', '台湾中央山脉']) {
    assert.ok(named.has(name), `${name}: missing major mountain system`);
  }
  assertInBounds(mountains.bbox.slice(0, 2), [-180, -90, 180, 90], 'Mountain extent southwest');
  assertInBounds(mountains.bbox.slice(2), [-180, -90, 180, 90], 'Mountain extent northeast');
  for (const feature of mountains.features) {
    const p = feature.properties;
    assert.equal(p.kind, 'mountain');
    assert.equal(p.schematic, true, `${p.name}: must disclose generalized mountain geometry`);
    assert.ok([1, 2, 3].includes(p.tier), `${p.name}: unsupported display tier`);
    for (const key of ['id', 'name', 'name_en', 'label', 'description', 'direction']) {
      assert.ok(typeof p[key] === 'string' && p[key].trim(), `${p.name}: missing ${key}`);
    }
    assert.match(p.precision_note, /示意|概化/, `${p.name}: missing scale limitation`);
    assert.match(p.precision_note, /非精确山脊线/, `${p.name}: must not imply a surveyed ridge`);
    assertReference(p.source, p.name);
    for (const position of linePositions(feature)) assertInBounds(position, mountains.bbox, p.name);
    assertInBounds(p.label_coord, mountains.bbox, `${p.name} label`);
  }
});

test('mountain axes occupy their expected physical regions and retain recognizable overall directions', () => {
  const regions = [
    ['喜马拉雅山脉', [78, 27, 97, 32]],
    ['昆仑山脉', [74, 34, 101, 39]],
    ['天山山脉', [79, 40, 97, 45]],
    ['秦岭', [103, 32, 114, 36]],
    ['大兴安岭', [116, 42, 124, 54]],
    ['台湾中央山脉', [120, 21.5, 122.5, 25.5]],
  ];
  for (const [name, bounds] of regions) {
    const feature = mountains.features.find(feature => feature.properties.name === name);
    assert.ok(feature, `${name}: missing mountain axis`);
    for (const position of linePositions(feature)) assertInBounds(position, bounds, name);
  }
  for (const name of ['昆仑山脉', '天山山脉', '秦岭']) {
    const positions = linePositions(mountains.features.find(feature => feature.properties.name === name));
    const longitudeSpan = Math.max(...positions.map(p => p[0])) - Math.min(...positions.map(p => p[0]));
    const latitudeSpan = Math.max(...positions.map(p => p[1])) - Math.min(...positions.map(p => p[1]));
    assert.ok(longitudeSpan > latitudeSpan * 2, `${name}: expected a predominantly east–west mountain system`);
  }
});

test('river centerlines retain traceable Natural Earth provenance and their documented cross-border extent', () => {
  assert.equal(rivers.type, 'FeatureCollection');
  const attribution = rivers.attribution;
  assert.match(attribution.source, /Natural Earth/);
  assertReference(attribution.source_url, 'River dataset');
  assert.match(new URL(attribution.source_url).pathname, /natural-earth-vector\/.*ne_10m_rivers_lake_centerlines\.geojson$/);
  assert.match(attribution.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(attribution.license, 'Public Domain');
  assert.equal(new URL(attribution.license_url).hostname, 'www.naturalearthdata.com');
  assert.match(attribution.scale, /1:1000万/);
  assert.match(attribution.precision_note, /非.*测绘/);
  assert.match(attribution.geometry_note, /跨境|境外/);
  assert.equal(new Set(rivers.features.map(feature => feature.properties.id)).size, rivers.features.length);
  assertInBounds(rivers.bbox.slice(0, 2), [-180, -90, 180, 90], 'River extent southwest');
  assertInBounds(rivers.bbox.slice(2), [-180, -90, 180, 90], 'River extent northeast');

  const positions = [];
  for (const feature of rivers.features) {
    const p = feature.properties;
    assert.equal(p.kind, 'river');
    assert.notEqual(p.schematic, true, `${p.name}: distinguish sourced centerlines from hand-drawn axes`);
    assert.ok([1, 2, 3].includes(p.tier), `${p.name}: unsupported display tier`);
    for (const key of ['id', 'name', 'name_en', 'label', 'description', 'basin']) {
      assert.ok(typeof p[key] === 'string' && p[key].trim(), `${p.name}: missing ${key}`);
    }
    assertReference(p.source, p.name);
    assert.match(p.precision_note, /1000万/);
    assert.match(p.precision_note, /非.*测绘/);
    assert.ok(p.source_features.length > 0, `${p.name}: missing original source identifiers`);
    for (const original of p.source_features) {
      assert.ok(original.name && original.dissolve, `${p.name}: untraceable source feature`);
      assert.ok(Number.isInteger(original.rivernum), `${p.name}: missing original river number`);
      assert.ok(['River', 'Lake Centerline'].includes(original.featurecla), `${p.name}: unsupported original feature type`);
    }
    for (const position of linePositions(feature)) {
      assertInBounds(position, rivers.bbox, p.name);
      positions.push(position);
    }
  }
  assert.deepEqual(rivers.bbox, [
    Math.min(...positions.map(p => p[0])), Math.min(...positions.map(p => p[1])),
    Math.max(...positions.map(p => p[0])), Math.max(...positions.map(p => p[1])),
  ], 'Declared extent must describe the retained source vertices');
  assert.ok(positions.some(([x, y]) => x > 135 || y < 18), 'Cross-border source segments should not be clipped to an artificial China rectangle');
});

test('the river layer covers distinct major basins and preserves important Chinese river-segment names', () => {
  const named = new Map(rivers.features.map(feature => [feature.properties.name, feature]));
  for (const name of ['长江', '金沙江', '通天河', '黄河', '黑龙江', '松花江', '辽河', '海河', '淮河', '闽江', '塔里木河', '澜沧江', '怒江', '雅鲁藏布江', '额尔齐斯河']) {
    assert.ok(named.has(name), `${name}: missing representative river or correctly named segment`);
  }
  for (const name of ['西江', '北江', '东江']) {
    assert.equal(named.get(name)?.properties.basin, '珠江', `${name}: preserve its own river name within the Pearl River system`);
  }
  assert.ok(named.has('入江水道'), 'The regulated Huai–Yangtze waterway needs a separate name');
  assert.match(named.get('淮河').properties.precision_note, /入江水道另列/);
  assert.match(named.get('黑龙江').properties.precision_note, /俄罗斯|跨境/);
  assert.match(named.get('长江').properties.precision_note, /未完整|缺段/);
});

test('Jinsha and Yangtze meet at Yibin without giving the entire upper river a downstream name', () => {
  const yangtze = rivers.features.find(feature => feature.properties.name === '长江');
  const jinsha = rivers.features.find(feature => feature.properties.name === '金沙江');
  const lowerKeys = new Set(linePositions(yangtze).map(position => position.join(',')));
  const shared = linePositions(jinsha).filter(position => lowerKeys.has(position.join(',')));
  assert.ok(shared.length > 0, 'The named river segments must retain their source confluence vertex');
  for (const position of shared) assertInBounds(position, [104.3, 28.5, 104.9, 29], 'Yibin confluence');
  assert.ok(linePositions(jinsha).some(([x]) => x < 100), 'Jinsha should extend west into the Hengduan mountain region');
  assert.ok(linePositions(yangtze).every(([x]) => x > 104), 'The downstream Yangtze label should begin near Yibin');
});
