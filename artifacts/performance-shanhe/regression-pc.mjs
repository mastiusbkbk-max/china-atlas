import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const out = new URL('./', import.meta.url);
const base = process.env.REGRESSION_URL || 'http://127.0.0.1:4210/china-atlas/';
const label = (process.env.REGRESSION_LABEL || 'cards').replace(/[^a-z0-9-]/gi, '');
const result = { url: base, started: new Date().toISOString(), checks: [], runtimeErrors: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(new URL('regression-profile-', out).pathname);
const executable = '/Users/haozhiheng/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = spawn(executable, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--disable-background-networking', '--no-first-run', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '', socket;
browser.stderr.on('data', b => stderr += b);
try {
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on '); i++) await pause(100);
  const endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1];
  assert.ok(endpoint, stderr.slice(-2000));
  const pages = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const packet = JSON.parse(event.data);
    if (packet.id) {
      const entry = pending.get(packet.id); pending.delete(packet.id);
      packet.error ? entry?.reject(Error(packet.error.message)) : entry?.resolve(packet.result);
    } else if (packet.method === 'Runtime.exceptionThrown') result.runtimeErrors.push(packet.params.exceptionDetails.exception?.description || packet.params.exceptionDetails.text);
  };
  const evaluate = async expression => {
    const packet = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (packet.exceptionDetails) throw Error(packet.exceptionDetails.exception?.description || packet.exceptionDetails.text);
    return packet.result.value;
  };
  const wait = async (expression, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await pause(30); }
    throw Error(`Condition timed out: ${expression}`);
  };
  const click = async selector => {
    const box = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(box, selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 });
  };
  const screenshot = async name => {
    const packet = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`regression-${label}-${name}.png`, out), Buffer.from(packet.data, 'base64'));
  };
  const ready = () => wait('!!window.__atlas?.landforms && !!window.__atlas.map.getSource("places") && window.__atlas.map.areTilesLoaded() && !window.__atlas.map.isMoving()', 30000);
  const record = async (name, expression) => {
    const value = await evaluate(expression);
    assert.ok(value?.passed, `${name}: ${JSON.stringify(value)}`);
    result.checks.push({ name, ...value });
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const dpr of [1, 2]) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: dpr, mobile: false });
    await send('Page.navigate', { url: base }); await ready(); await pause(250);
    await record(`DPR ${dpr} full map and data`, `(() => {const a=window.__atlas,m=a.map,s=m.getStyle().sources;const count=id=>{const d=s[id].data;return(typeof d==='string'?JSON.parse(d):d).features.length};const canvas=m.getCanvas();const visible=[...new Set(m.queryRenderedFeatures({layers:['place-labels']}).map(f=>f.properties.id))];return {passed:count('places')===81&&count('geography-names')===9&&a.landforms.features.length===84&&m.getTerrain()?.exaggeration===1.5&&canvas.width===1496*devicePixelRatio&&canvas.height===900*devicePixelRatio, destinations:count('places'),regions:count('geography-names'),landforms:a.landforms.features.length,terrain:m.getTerrain(),canvas:[canvas.width,canvas.height],visiblePlaces:visible};})()`);
    await record(`DPR ${dpr} rendered region labels`, `(() => {const m=window.__atlas.map,names=[...new Set(m.queryRenderedFeatures({layers:['geography-names']}).map(f=>f.properties.name))],layer=m.getLayer('geography-names');return {passed:names.length>=6&&m.getLayoutProperty('geography-names','text-allow-overlap')===true&&m.getLayoutProperty('geography-names','text-ignore-placement')===true,names,count:names.length,minzoom:layer.minzoom,maxzoom:layer.maxzoom};})()`);
    if (dpr === 1) await screenshot('home-dpr1');
  }
  result.screenshotLimitation = 'Headless Chromium GPU Page.captureScreenshot stalled at DPR2; DPR2 canvas and functional assertions were checked separately. Screenshots use DPR1.';
  await send('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false });
  await pause(150);

  if (label === 'cards') result.pixelDecodingReference = 'regression-images-pc.json: unchanged JPEG protocol already passed all six sample comparisons';
  else {
  const tilePaths = ['satellite/3/6/3.jpg', 'satellite/4/12/6.jpg', 'satellite/5/25/12.jpg', 'satellite/9/422/212.jpg', 'relief/0/0/0.jpg', 'relief/4/12/6.jpg'];
  result.pixelDecoding = await evaluate(`(async () => {
    const hex=buffer=>Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,'0')).join('');
    const results=[];
    for (const path of ${JSON.stringify(tilePaths)}) {
      const url=new URL('tiles/'+path,location.href).href,response=await fetch(url),bytes=await response.arrayBuffer();
      if(!response.ok)throw Error('Missing pixel test tile: '+path);
      const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}),{premultiplyAlpha:'none'});
      const image=new Image();image.decoding='async';image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
      const before=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
      const after=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let differingChannels=0,maxDifference=0;
      for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);if(d)differingChannels++;maxDifference=Math.max(maxDifference,d);}
      results.push({path,dimensions:[canvas.width,canvas.height],channels:before.length,differingChannels,maxDifference,encodedSha256:hex(await crypto.subtle.digest('SHA-256',bytes)),decodedSha256:hex(await crypto.subtle.digest('SHA-256',after))});
      bitmap.close();
    }
    return results;
  })()`);
  for (const sample of result.pixelDecoding) {
    const response = await fetch(new URL(`tiles/${sample.path}`, 'http://127.0.0.1:4207/china-atlas/'));
    assert.ok(response.ok, sample.path);
    sample.referenceSha256 = createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex');
    assert.equal(sample.encodedSha256, sample.referenceSha256, 'Candidate JPEG bytes changed');
    assert.equal(sample.differingChannels, 0, `Image decoders changed pixels: ${sample.path}`);
    assert.equal(sample.maxDifference, 0);
  }
  result.checks.push({ name: 'Original JPEG bytes and full RGBA pixels identical across bitmap/image decoders', passed: true, samples: result.pixelDecoding.length });
  }

  await evaluate(`(() => {const t=document.querySelector('#destination-track');t.scrollTo({left:t.scrollWidth,behavior:'instant'});})()`);
  await wait(`(() => {const t=document.querySelector('#destination-track'),c=t.lastElementChild,r=c.getBoundingClientRect(),tr=t.getBoundingClientRect(),i=c.querySelector('img');return r.left>=tr.left&&r.right<=tr.right+1&&i.complete&&i.naturalWidth>0;})()`);
  await evaluate(`document.querySelector('#destination-track').lastElementChild.querySelector('img').decode()`);
  await record('All 81 cards and final card content render after horizontal scrolling', `(() => {const t=document.querySelector('#destination-track'),cards=t.querySelectorAll('.destination-card'),c=cards[cards.length-1],p=window.__atlas.places.at(-1),i=c.querySelector('img'),r=document.createRange();r.selectNodeContents(c.querySelector('.card-title strong'));const textRect=r.getBoundingClientRect();return {passed:cards.length===81&&c.dataset.place===p.id&&c.innerText.includes(p.name)&&i.complete&&i.naturalWidth>0&&textRect.width>0&&textRect.height>0&&c.checkVisibility({contentVisibilityAuto:true}),lastId:c.dataset.place,lastText:c.querySelector('.card-title strong').innerText,image:[i.naturalWidth,i.naturalHeight],scroll:[t.scrollLeft,t.scrollWidth,t.clientWidth],contentVisibility:getComputedStyle(c).contentVisibility};})()`);
  await screenshot('last-card-dpr1');
  await evaluate(`(() => {const t=document.querySelector('#destination-track');t.scrollTo({left:0,behavior:'instant'});t.querySelectorAll('.destination-card')[79].focus();})()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await record('Keyboard Tab reaches and reveals the final offscreen card', `(() => {const t=document.querySelector('#destination-track'),c=t.lastElementChild,r=c.getBoundingClientRect(),tr=t.getBoundingClientRect();return {passed:document.activeElement===c&&c.checkVisibility({contentVisibilityAuto:true})&&r.left>=tr.left-1&&r.right<=tr.right+1,active:document.activeElement.dataset.place,last:c.dataset.place,rect:[r.left,r.right],track:[tr.left,tr.right]};})()`);
  await evaluate(`document.querySelector('#destination-track').scrollTo({left:0,behavior:'instant'})`);

  const target = await evaluate(`(() => {const m=window.__atlas.map;for(const f of m.queryRenderedFeatures({layers:['place-labels']})){const p=m.project(f.geometry.coordinates);for(const [dx,dy] of [[0,0],[10,0],[20,0]]){const x=p.x+dx,y=p.y+dy;if(x<520||x>1400||y<125||y>570)continue;const e=document.elementFromPoint(x,y),hit=m.queryRenderedFeatures([x,y],{layers:['place-labels']})[0];if(e===m.getCanvas()&&hit)return {x,y,id:hit.properties.id};}}return null;})()`);
  assert.ok(target, 'No unobstructed native place label found');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await record('Actual native label click and event arbitration', `(() => {const a=window.__atlas,p=a.places.find(p=>p.id===a.state.selected);return {passed:a.state.selected===${JSON.stringify(target.id)}&&a.state.landform===null&&location.hash==='#'+p.id&&!document.querySelector('.place-panel').hidden&&document.querySelector('.place-panel h2').textContent.includes(p.name),selected:a.state.selected,landform:a.state.landform};})()`);
  await wait('document.querySelectorAll(".place-photo").length>0');
  await record('PC rich reading and photo metadata', `(() => {const p=document.querySelector('.place-panel');return {passed:p.classList.contains('place-reading')&&p.querySelectorAll('.place-chapter').length===2&&p.querySelectorAll('[data-photo]').length===2&&p.querySelector('.photo-credit').textContent.includes('摄影'),chapters:p.querySelectorAll('.place-chapter').length,photoButtons:p.querySelectorAll('[data-photo]').length};})()`);
  await screenshot('reading-dpr1');
  await click('.cover-photo-button');
  await record('Full photo dialog', `(() => {const d=document.querySelector('.photo-dialog');return {passed:d.open&&!!d.querySelector('img').getAttribute('src')&&document.querySelector('#photo-count').textContent.includes('02'),title:document.querySelector('#photo-title').textContent,count:document.querySelector('#photo-count').textContent};})()`);
  await click('.photo-dialog [data-close]');
  await click('#home-button');
  await record('Reset clears selection', `({passed:window.__atlas.state.selected===null&&window.__atlas.state.landform===null&&document.querySelector('.place-panel').hidden&&location.hash===''})`);
  await click('[data-category="nature"]');
  await record('Nature classification', `(() => {const a=window.__atlas;return {passed:a.state.category==='nature'&&document.querySelectorAll('.destination-card').length===a.places.filter(p=>p.category==='nature').length,filter:a.map.getFilter('place-labels')};})()`);
  await click('.search-toggle');
  await evaluate(`(() => {const e=document.querySelector('#search-input');e.value='故宫';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('.search-results [data-place="forbidden-city"]');
  await record('Cross-category search restores all places', `({passed:window.__atlas.state.category==='all'&&window.__atlas.state.selected==='forbidden-city'&&document.querySelectorAll('.destination-card').length===81&&!document.querySelector('.search-dialog').open})`);
  await click('#home-button');
  await click('[data-landform-kind="river"]');
  await record('River visibility toggle', `({passed:window.__atlas.state.rivers===false&&window.__atlas.map.getLayoutProperty('river-line-1','visibility')==='none'&&!document.querySelector('#river-toggle').checked})`);
  await click('[data-landform-kind="river"]');
  await click('#layers-button');
  await evaluate(`(() => {const s=document.querySelector('#landform-select');s.value=[...s.options].find(o=>o.value).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await record('Landform selector replaces place selection', `({passed:!!window.__atlas.state.landform&&window.__atlas.state.selected===null&&document.querySelector('.place-panel').classList.contains('landform-detail'),selected:window.__atlas.state.landform})`);
  await click('#home-button');
  await send('Page.navigate', { url: `${base}#everest` }); await ready();
  await record('Direct place link', `({passed:window.__atlas.state.selected==='everest'&&document.querySelector('.place-panel h2').textContent.includes('珠穆朗玛峰')&&window.__atlas.map.getFilter('place-selected')[2]==='everest',hash:location.hash})`);

  const hook = await send('Page.addScriptToEvaluateOnNewDocument', { source: `const originalMark=performance.mark.bind(performance);performance.mark=(name,...args)=>{const value=originalMark(name,...args);if(name==='atlas-interactive')queueMicrotask(()=>{const a=window.__atlas;window.__earlySelection={beforeNative:!!a&&!a.map.getSource('places')};a.selectPlace('guilin');});return value;};` });
  await send('Page.navigate', { url: base }); await ready();
  await record('Selection before native layers install', `({passed:window.__earlySelection?.beforeNative===true&&window.__atlas.state.selected==='guilin'&&window.__atlas.map.getFilter('place-selected')[2]==='guilin'&&document.querySelector('.place-panel h2').textContent.includes('桂林'),early:window.__earlySelection,selected:window.__atlas.state.selected})`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier });
  const earlyCards = await send('Page.addScriptToEvaluateOnNewDocument', { source: `const mark=performance.mark.bind(performance);performance.mark=(name,...args)=>{const value=mark(name,...args);if(name==='atlas-shell'){const track=document.querySelector('#destination-track'),card=track.firstElementChild;window.__earlyCardNode=card;window.__earlyCards={initialCount:track.childElementCount,id:card.dataset.place};card.focus({preventScroll:true});document.querySelector('#cards-next').click();window.__earlyCards.afterArrow=track.childElementCount;requestAnimationFrame(()=>{window.__earlyCards.scrollAfterArrow=track.scrollLeft;});}return value;};` });
  await send('Page.navigate', { url: base }); await ready();
  await record('Early first-card focus survives completion without replacing its node', `({passed:window.__earlyCards?.initialCount===5&&window.__earlyCardNode.isConnected&&document.activeElement===window.__earlyCardNode&&document.querySelector('#destination-track').firstElementChild===window.__earlyCardNode,early:window.__earlyCards,active:document.activeElement.dataset.place})`);
  await record('Early carousel next request fills and scrolls all destinations immediately', `({passed:window.__earlyCards.afterArrow===81&&window.__earlyCards.scrollAfterArrow>0,early:window.__earlyCards})`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: earlyCards.identifier });
  const earlyCategory = await send('Page.addScriptToEvaluateOnNewDocument', { source: `const mark=performance.mark.bind(performance);performance.mark=(name,...args)=>{const value=mark(name,...args);if(name==='atlas-shell'){window.__earlyCategoryCount=document.querySelector('#destination-track').childElementCount;document.querySelector('[data-category="nature"]').click();setTimeout(()=>document.querySelector('[data-category="culture"]').click(),0);}return value;};` });
  await send('Page.navigate', { url: base }); await ready(); await pause(200);
  await record('Early classification changes remain consistent when completion runs', `(() => {const a=window.__atlas,actual=[...document.querySelectorAll('.destination-card')].map(e=>e.dataset.place),expected=a.places.filter(p=>p.category==='culture').map(p=>p.id);return {passed:window.__earlyCategoryCount===5&&a.state.category==='culture'&&actual.length===expected.length&&actual.every((id,i)=>id===expected[i])&&new Set(actual).size===actual.length,initialCount:window.__earlyCategoryCount,category:a.state.category,cardCount:actual.length,expectedCount:expected.length};})()`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: earlyCategory.identifier });
  assert.equal(result.runtimeErrors.length, 0, JSON.stringify(result.runtimeErrors));
  result.completed = true;
} catch (error) { result.failure = error.stack; throw error; }
finally {
  result.finished = new Date().toISOString();
  await writeFile(new URL(`regression-${label}-pc.json`, out), JSON.stringify(result, null, 2));
  socket?.close(); const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill('SIGTERM');
  await Promise.race([stopped, pause(1500)]); if (browser.exitCode === null && browser.signalCode === null) browser.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ completed: result.completed || false, checks: result.checks.length, runtimeErrors: result.runtimeErrors, failure: result.failure }));
}
