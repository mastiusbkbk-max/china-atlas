import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = new URL('./', import.meta.url);
const variants = (process.env.PERF_VARIANTS || 'original,published').split(',');
const urls = { original: 'http://127.0.0.1:4201/china-atlas/', published: 'http://127.0.0.1:4202/china-atlas/', candidate: 'http://127.0.0.1:4203/china-atlas/', parallel: 'http://127.0.0.1:4204/china-atlas/', preload: 'http://127.0.0.1:4205/china-atlas/', redraw: 'http://127.0.0.1:4206/china-atlas/', final: 'http://127.0.0.1:4207/china-atlas/', static: 'http://127.0.0.1:4208/china-atlas/', images: 'http://127.0.0.1:4209/china-atlas/', cards: 'http://127.0.0.1:4210/china-atlas/' };
const label = (process.env.PERF_LABEL || 'interleaved-current').replace(/[^a-z0-9-]/gi, '');
const repeats = Number(process.env.PERF_REPEATS || 5);
const dprs = (process.env.PERF_DPRS || '1,2').split(',').map(Number);
const interactions = process.env.PERF_INTERACTIONS === '1';
assert.ok(variants.every(v => urls[v]), 'Unknown performance variant');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const frameStats = sample => {
  const stats = times => {
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    return { frames: times.length, fps: times.length > 1 ? 1000 * (times.length - 1) / (times.at(-1) - times[0]) : 0, medianMs: gaps[Math.floor(gaps.length * .5)], p95Ms: gaps[Math.floor(gaps.length * .95)], maxMs: gaps.at(-1) };
  };
  return { raf: stats(sample.raf), rendered: stats(sample.rendered) };
};
const result = { label, started: new Date().toISOString(), variants, urls, conditions: { width: 1496, height: 900, dprs, repeats, ordering: 'Each trial alternates variant order; every cold navigation is followed immediately by a genuine warm reload.', network: 'Same loopback static handler; no throttling; all non-local browser requests blocked.', cache: 'Separate ports isolate each origin storage. Cold clears all HTTP cache and that origin storage; warm is Page.reload. GPU, shader and OS caches are shared, not cleared.', paint: 'Actual satellite texture drawn, source loaded and input enabled, followed by two rAF callbacks; actual drag performed after complete-terrain timing.' }, warmups: [], navigation: [], clicks: [], frames: [], runtimeExceptions: [], instrumentationExceptions: [], blocked: [] };
result.conditions.interactions = interactions;
result.conditions.targets = { mapMs: 640, warmMs: 80, clickMs: 40, firstRealSceneMs: 640, detailMs: 800, ordinaryFps: 100, complexFps: 75 };
result.conditions.statistics = 'Median averages both middle values for even sample counts; p90 is nearest-rank ceil(0.9*n). No measured samples are discarded.';
try { result.hardware = execFileSync('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string', 'hw.memsize', 'hw.ncpu'], { encoding: 'utf8' }).trim().split('\n'); } catch {}
await mkdir(out, { recursive: true });
const profile = await mkdtemp(new URL('profile-', out).pathname);
const executable = '/Users/haozhiheng/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = spawn(executable, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '', socket, send, evaluate, network = [];
browser.stderr.on('data', b => stderr += b);
const persist = () => writeFile(new URL(`${label}.json`, out), JSON.stringify({ ...result, finished: new Date().toISOString() }, null, 2));
const summary = () => {
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const p90 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .9) - 1];
  const rows = [];
  for (const variant of variants) for (const dpr of dprs) for (const cache of ['cold', 'warm-reload']) {
    const samples = result.navigation.filter(n => n.variant === variant && n.dpr === dpr && n.cache === cache);
    const values = samples.map(n => n.mapReady.time);
    const full = samples.map(n => n.fullReady?.time).filter(Number.isFinite);
    if (samples.length) rows.push({ variant, dpr, cache, samples: samples.length, medianMapMs: median(values), p90MapMs: p90(values), minMapMs: Math.min(...values), maxMapMs: Math.max(...values), medianFullMs: median(full), p90FullMs: p90(full), minFullMs: Math.min(...full), maxFullMs: Math.max(...full) });
  }
  return rows;
};
try {
  for (let n = 0; n < 100 && !stderr.includes('DevTools listening on '); n++) await pause(100);
  const endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1];
  assert.ok(endpoint, stderr.slice(-2000));
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0; const pending = new Map();
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = e => {
    const p = JSON.parse(e.data);
    if (p.id) { const h = pending.get(p.id); pending.delete(p.id); p.error ? h?.reject(Error(p.error.message)) : h?.resolve(p.result); return; }
    if (p.method === 'Fetch.requestPaused') {
      const { request, requestId } = p.params, u = new URL(request.url);
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol);
      if (!local) result.blocked.push(request.url);
      send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(local ? {} : { errorReason: 'BlockedByClient' }) }).catch(error => result.instrumentationExceptions.push({ error: error.message, url: request.url }));
    }
    if (p.method === 'Runtime.exceptionThrown') result.runtimeExceptions.push(p.params.exceptionDetails.exception?.description || p.params.exceptionDetails.text);
    if (p.method === 'Network.responseReceived') network.push({ url: p.params.response.url, status: p.params.response.status, fromDiskCache: p.params.response.fromDiskCache, fromServiceWorker: p.params.response.fromServiceWorker });
  };
  evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = async (expression, timeout = 15000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return true; await pause(20); } return false; };
  const click = async selector => {
    const point = await evaluate(`(() => {const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Missing click target'); const b = e.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2; if (!b.width || !b.height || !e.contains(document.elementFromPoint(x,y))) throw Error('Covered click target'); return {x,y};})()`);
    await send('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point});
  };
  const navigate = async (variant, dpr, trial, cache, warmup = false) => {
    network = [];
    const base = urls[variant];
    if (cache === 'cold') { await send('Page.navigate', { url: 'about:blank' }); await send('Network.clearBrowserCache'); await send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'all' }); await send('Page.navigate', { url: base }); }
    else await send('Page.reload', { ignoreCache: false });
    assert.ok(await wait('!!window.__shanhePerf?.mapReady'), 'Actual textured map failed to become interactive');
    assert.ok(await wait('!!window.__shanhePerf?.fullReady'), 'Full terrain and geography failed to load');
    const snapshot = await evaluate('window.__shanhePerf.snapshot()');
    const item = { variant, dpr, trial, cache, api: snapshot.api, firstRaster: snapshot.firstRaster, mapReady: snapshot.mapReady, fullReady: snapshot.fullReady, navigation: snapshot.navigation, pageShows: snapshot.pageShows, marks: snapshot.marks, resources: snapshot.resources, longTasks: snapshot.longTasks, errors: snapshot.errors, gpu: snapshot.gpu, network: [...network] };
    assert.equal(item.navigation[0].type, cache === 'cold' ? 'navigate' : 'reload');
    assert.ok(item.pageShows.every(p => p.persisted === false));
    assert.equal(item.fullReady.features, 84);
    item.cards = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('#destination-track .destination-card')];
      return {count: cards.length, lastId: cards.at(-1)?.dataset.place, expectedLastId: window.__atlas.places.at(-1).id};
    })()`);
    assert.equal(item.cards.count, 81);
    assert.equal(item.cards.lastId, item.cards.expectedLastId);
    item.renderedGeographyNames = await evaluate(`(() => {
      const map = window.__atlas.map;
      if (map.getLayer('geography-names')) return [...new Set(map.queryRenderedFeatures({layers:['geography-names']}).map(f => f.properties.name))];
      return [...document.querySelectorAll('.geography-label')].filter(e => {
        const b = e.getBoundingClientRect(), s = getComputedStyle(e);
        return s.visibility !== 'hidden' && s.display !== 'none' && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight;
      }).map(e => e.textContent);
    })()`);
    const before = await evaluate('window.__atlas.map.getCenter().toArray()');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: 930, y: 450 });
    for (let i = 1; i <= 5; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: 930 + i * 8, y: 450 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 970, y: 450 });
    await pause(80);
    const after = await evaluate('window.__atlas.map.getCenter().toArray()');
    item.pointerDragAccepted = Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) > .01;
    assert.ok(item.pointerDragAccepted);
    (warmup ? result.warmups : result.navigation).push(item);
    console.log(JSON.stringify({ variant, dpr, trial, cache, warmup, mapMs: item.mapReady.time, fullMs: item.fullReady.time }));
    if (interactions && !warmup && cache === 'warm-reload') {
      assert.ok(await wait('!window.__atlas.map.isMoving() && window.__atlas.map.areTilesLoaded()'));
      if (trial === 1) {
        const raw = await evaluate('window.__shanhePerf.sampleFrames(2000)');
        const frame = {variant, dpr, trial, scene:'ordinary overview, simultaneous rotation and zoom', ...frameStats(raw), raw};
        result.frames.push(frame);
        console.log(JSON.stringify({kind:'frames', variant, dpr, raf:frame.raf, rendered:frame.rendered}));
        assert.ok(await wait('!window.__atlas.map.isMoving()'));
      }
      await click('.search-toggle');
      await evaluate("(() => {const e=document.querySelector('#search-input'); e.value='珠穆朗玛峰'; e.dispatchEvent(new Event('input'));})()");
      const selector = '.search-results [data-place="everest"]';
      await evaluate(`window.__shanhePerf.armClick(${JSON.stringify(selector)})`);
      await click(selector);
      assert.ok(await wait('!!window.__shanhePerf.click?.paint', 5000));
      const feedback = await evaluate('window.__shanhePerf.click');
      result.clicks.push({variant, dpr, trial, ...feedback});
      console.log(JSON.stringify({kind:'click', variant, dpr, trial, ...feedback}));
    }
    result.summary = summary(); await persist();
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: false });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const probeSource = await readFile(new URL('probe-interleaved.js', out), 'utf8');
  await writeFile(new URL(`${label}-probe.js`, out), probeSource);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: probeSource });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  result.browser = await send('Browser.getVersion');
  for (const dpr of dprs) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: dpr, mobile: false });
    for (const variant of variants) await navigate(variant, dpr, 0, 'cold', true);
    for (let trial = 1; trial <= repeats; trial++) {
      const order = trial % 2 === 1 ? variants : [...variants].reverse();
      for (const variant of order) { await navigate(variant, dpr, trial, 'cold'); await navigate(variant, dpr, trial, 'warm-reload'); }
    }
  }
  result.completed = true; result.summary = summary(); await persist();
  console.log(JSON.stringify({ completed: true, summary: result.summary, runtimeExceptions: result.runtimeExceptions.length, instrumentationExceptions: result.instrumentationExceptions.length }));
} catch (error) {
  result.failure = error.stack; result.browserStderr = stderr.slice(-4000); await persist(); throw error;
} finally {
  socket?.close(); const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill('SIGTERM');
  await Promise.race([stopped, pause(2000)]); if (browser.exitCode === null && browser.signalCode === null) browser.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true });
}
