import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { places, highlights } from '../src/content.js';
import { addPlaceMarkers } from '../src/map-markers.js';
import { addLandforms, landformLabelLayers } from '../src/landforms.js';

function mapFixture() {
  const sources = new Map(), layers = new Map(), handlers = [], queries = [], canvasListeners = new Map();
  const canvas = { style: {}, addEventListener: (type, fn) => canvasListeners.set(type, fn) };
  return {
    sources, layers, queries, canvasListeners, hits: [],
    addSource: (id, source) => sources.set(id, source),
    addImage() {},
    addLayer: layer => layers.set(layer.id, layer),
    getLayer: id => layers.get(id),
    getCanvas: () => canvas,
    setFilter: (id, filter) => { layers.get(id).filter = filter; },
    setLayoutProperty: (id, property, value) => { layers.get(id).layout[property] = value; },
    on(type, layer, fn) { handlers.push({ type, layer: fn ? layer : null, fn: fn || layer }); },
    emit(type, event) { for (const h of handlers) if (h.type === type && !h.layer) h.fn(event); },
    queryRenderedFeatures(geometry, options) {
      queries.push({ geometry, options });
      return this.hits.filter(hit => options.layers.includes(hit.layer.id));
    }
  };
}

function visibleIds(map, layerId) {
  const expression = createExpression(map.layers.get(layerId).filter, `layers.${layerId}.filter`);
  assert.equal(expression.result, 'success');
  return map.sources.get('places').data.features.filter(f => expression.value.evaluate({ zoom: 4 }, f)).map(f => f.properties.id);
}

function clickEvent() {
  return { point: { x: 100, y: 200 }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

test('all 81 original destinations and nine regional labels remain on the map', () => {
  const map = mapFixture();
  const update = addPlaceMarkers(map, places, highlights, () => {});
  update({ category: 'all', selected: null });
  const points = map.sources.get('places').data.features;
  assert.deepEqual(points.map(f => [f.properties.id, f.geometry.coordinates]), places.map(p => [p.id, p.coordinate]));
  assert.deepEqual(new Set(visibleIds(map, 'place-labels')), new Set(places.map(p => p.id)));
  assert.deepEqual(visibleIds(map, 'place-selected'), []);
  const regions = map.sources.get('geography-names').data.features;
  assert.equal(regions.length, 9);
  for (const name of ['青 藏 高 原', '南 海', '台 湾 岛', '海 南 岛']) assert.ok(regions.some(f => f.properties.name === name));
});

test('classification and selected-place changes preserve every matching destination without duplicate labels', () => {
  const map = mapFixture();
  const update = addPlaceMarkers(map, places, highlights, () => {});
  const selected = places.find(p => p.category === 'culture');
  update({ category: 'culture', selected: selected.id });
  assert.deepEqual(new Set(visibleIds(map, 'place-labels')), new Set(places.filter(p => p.category === 'culture' && p.id !== selected.id).map(p => p.id)));
  assert.deepEqual(visibleIds(map, 'place-selected'), [selected.id]);
  update({ category: 'nature', selected: null });
  assert.deepEqual(new Set(visibleIds(map, 'place-labels')), new Set(places.filter(p => p.category === 'nature').map(p => p.id)));
  assert.deepEqual(visibleIds(map, 'place-selected'), []);
  update({ category: 'all', selected: null });
  assert.equal(visibleIds(map, 'place-labels').length, 81);
});

test('overlapping place labels select only the topmost destination and consume only actual hits', () => {
  const map = mapFixture(), selected = [];
  addPlaceMarkers(map, places, highlights, id => selected.push(id));
  map.hits = [
    { properties: { id: places[0].id }, layer: { id: 'place-selected', paint: {} } },
    { properties: { id: places[1].id }, layer: { id: 'place-labels', paint: {} } }
  ];
  const hit = clickEvent();
  map.emit('click', hit);
  assert.deepEqual(selected, [places[0].id]);
  assert.equal(hit.defaultPrevented, true);
  map.emit('click', hit);
  assert.equal(selected.length, 1, 'a consumed event must not select again');
  map.hits = [];
  const empty = clickEvent();
  map.emit('click', empty);
  assert.equal(empty.defaultPrevented, false, 'empty-map clicks remain available to other map interactions');
});

test('place and landform clicks do not overwrite each other, while hover queries merge per animation frame', async t => {
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const frames = new Map();
  let serial = 0;
  globalThis.document = { fonts: { load: () => Promise.resolve() } };
  globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    landformLabelLayers.length = 0;
  });
  const map = mapFixture(), placeSelections = [], landformSelections = [];
  addPlaceMarkers(map, places, highlights, id => placeSelections.push(id));
  const collections = ['mountains', 'rivers'].map(name => JSON.parse(readFileSync(new URL(`../public/data/${name}.geojson`, import.meta.url))));
  await addLandforms(map, feature => landformSelections.push(feature.properties.id), collections);
  const mountain = collections[0].features[0];
  map.hits = [
    { properties: { id: places[0].id }, layer: { id: 'place-selected', paint: {} } },
    { properties: mountain.properties, layer: { id: 'mountain-line-1', paint: { 'line-opacity': 1 } } }
  ];
  map.emit('click', clickEvent());
  assert.deepEqual(placeSelections, [places[0].id]);
  assert.deepEqual(landformSelections, []);
  map.hits.shift();
  map.emit('click', clickEvent());
  assert.deepEqual(landformSelections, [mountain.properties.id]);

  map.queries.length = 0;
  for (const point of [{ x: 1, y: 2 }, { x: 10, y: 20 }, { x: 30, y: 40 }]) map.emit('mousemove', { point });
  assert.equal(frames.size, 1);
  assert.equal(map.queries.length, 0);
  const [id, callback] = [...frames][0];
  frames.delete(id); callback();
  assert.equal(map.queries.length, 1);
  const [[left, top], [right, bottom]] = map.queries[0].geometry;
  assert.deepEqual([(left + right) / 2, (top + bottom) / 2], [30, 40], 'the latest pointer position is sampled');
  assert.equal(map.getCanvas().style.cursor, 'pointer');
  map.emit('mousemove', { point: { x: 50, y: 50 } });
  map.canvasListeners.get('mouseleave')();
  assert.equal(frames.size, 0, 'leaving the canvas cancels pending hover work');
  assert.equal(map.getCanvas().style.cursor, '');
});
