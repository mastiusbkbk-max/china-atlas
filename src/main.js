import { mapEngine } from './map-engine.js';
import { places, chapters, sources, themes, highlights, provinceNames } from './content.js';
import { icon } from './icons.js';
import { addLandforms, loadLandformData, landformBounds } from './landforms.js';
import { placeStories } from './place-stories.js';
import { installTileProtocol, setDetailTileCoverage } from './map-tiles.js';
import { addPlaceMarkers } from './map-markers.js';

let maplibregl;
const assetUrl = path => `${import.meta.env.BASE_URL}${path.replace(/^\.?\//, '')}`;
const thumbnail = p => assetUrl(p.image.replace('/images/', '/images/thumbs/').replace(/\.jpg$/, '.webp'));

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { category: 'all', selected: null, landform: null, terrain: true, layer: 'satellite', borders: false, rivers: true, mountains: true, tour: false, tourIndex: 0, tourIds: highlights, mapReady: false };
const catalog = { theme: 'all', province: 'all', query: '' };
let tourTimer;
let map;
let cameraSequence = 0;
let landforms;
let updatePlaceMarkers;
let markerFrame;
let markerTimer;
let lastMarkerUpdate = 0;
const searchAliases = { everest: '珠峰 Everest Qomolangma', yangtze: '长江三峡 瞿塘峡 白帝城 夔门', guilin: '桂林漓江 阳朔', dunhuang: '敦煌月牙泉 鸣沙山', 'forbidden-city': '北京故宫 紫禁城 故宫博物院', 'great-wall': '金山岭长城 万里长城', qinghai: '青海湖 Qinghai Lake', dali: '大理古城 苍山洱海' };
let photos = {};
let detailPhotos = {};
let photoPlace;
let photoIndex = 0;
let photographyReady;
let provincesLoaded = false;

const app = $('#app');
app.innerHTML = `
  <main class="atlas" aria-label="中国三维地理图鉴">
    <div id="map" aria-label="可缩放、旋转的中国三维地图"></div>
    <div class="map-vignette"></div><div class="editorial-shade"></div>
    <header class="masthead">
      <a class="brand" href="#" aria-label="山河志，返回中国全景"><span class="brand-seal" aria-hidden="true">山</span><span class="brand-word">山河志<span aria-hidden="true">ATLAS OF CHINA</span></span></a>
      <nav class="main-nav" aria-label="主导航">
        <button class="nav-link active" data-category="all">地理探索</button>
        <button class="nav-link" data-category="nature">自然奇境</button>
        <button class="nav-link" data-category="culture">人文足迹</button>
        <button class="nav-link" id="chapters-button">山河专题<span class="nav-new">${chapters.length}</span></button>
      </nav>
      <div class="header-actions"><span class="edition">CHINA · 01</span><button class="icon-button search-toggle" aria-label="搜索目的地">${icon('search')}</button><button class="about-button" id="about-button">关于山河志 ${icon('arrow')}</button></div>
    </header>
    <section class="intro" aria-labelledby="hero-title">
      <div class="eyebrow"><span></span> 以地理的眼光，重新发现中国</div>
      <h1 id="hero-title">山河辽阔，<br>值得<span>亲历。</span></h1>
      <p class="intro-copy">从世界屋脊，到江海之滨。<br>穿行于真实的三维地形，读懂这片土地的<br class="desktop-break">自然造化与人间万象。</p>
      <button class="primary-button" id="explore-button">开启山河之旅 ${icon('arrow')}</button>
      <button class="tour-link" id="intro-tour">${icon('play')} 跟随镜头，漫游中国 <span>约 2 分钟</span></button>
      <div class="country-stats"><div><strong>960<span>万</span></strong><small>陆地面积约 / km²</small></div><div><strong>8,848.86</strong><small>珠峰雪面高程 / m</small></div><div><strong>34</strong><small>省级行政区</small></div></div>
    </section>
    <aside class="place-panel" aria-label="地点介绍" hidden></aside>
    <div class="map-caption"><span class="live-dot"></span> 中国全景 <span class="caption-divider">/</span><span id="map-mode">三维地形已开启</span></div>
    <div class="map-controls" aria-label="地图控制">
      <button class="compass-button" id="north-button" aria-label="恢复正北方向"><span>N</span>${icon('compass')}</button>
      <div class="control-group"><button id="zoom-in" aria-label="放大地图">${icon('plus')}</button><button id="zoom-out" aria-label="缩小地图">${icon('minus')}</button></div>
      <div class="control-group"><button id="terrain-button" class="is-active" aria-label="3D，切换三维地形" aria-pressed="true"><span class="dimension">3D</span></button><button id="home-button" aria-label="回到中国全景">${icon('home')}</button><button id="fullscreen-button" aria-label="进入全屏">${icon('full')}</button></div>
    </div>
    <div class="map-bottom-tools">
      <div class="landform-legend" aria-label="山系与水系图例"><button data-landform-kind="mountain" aria-pressed="true" title="显示或隐藏主要山脉"><i class="mountain-key"></i>山脉走向</button><button data-landform-kind="river" aria-pressed="true" title="显示或隐藏主要河流"><i class="river-key"></i>主要河流</button></div>
      <button class="layers-button" id="layers-button" aria-expanded="false">${icon('layers')} <span>地图图层</span> ${icon('down')}</button>
      <div class="layer-picker" hidden><h3>以不同视角，看见中国</h3><div class="basemap-options"><button class="basemap active" data-layer="satellite"><span class="basemap-thumb satellite-thumb"></span>卫星影像</button><button class="basemap" data-layer="relief"><span class="basemap-thumb relief-thumb"></span>地形晕渲</button></div><label><span>省级行政区划</span><input type="checkbox" id="border-toggle"></label><label><span><i class="mountain-key"></i>主要山脉 · 走向示意</span><input type="checkbox" id="mountain-toggle" checked></label><label><span><i class="river-key"></i>主要水系 · 概览中心线</span><input type="checkbox" id="river-toggle" checked></label><select id="landform-select" aria-label="按名称定位山脉或河流"><option value="">按名称定位山脉或河流…</option></select><p class="landform-hint">点击线条或名称，读懂山河。<br>放大后渐隐概览线，观察真实地形。</p></div>
      <span class="map-gesture">${icon('compass')} 拖动探索 · 滚轮缩放 · 右键旋转</span>
      <div class="tour-player" hidden><button id="tour-pause" aria-label="暂停漫游">${icon('pause')}</button><span><small>山河漫游</small><strong id="tour-place"></strong></span><span id="tour-count"></span><button id="tour-next" aria-label="下一个地点">${icon('chevron')}</button><button id="tour-close" aria-label="结束漫游">${icon('close')}</button><div class="tour-progress"></div></div>
    </div>
    <section class="discover" aria-label="精选目的地">
      <div class="discover-heading"><div><span class="section-index">01 / DISCOVER</span><h2 id="discover-title">循着山河，遇见中国</h2></div><span class="discover-note" id="discover-note">每一个坐标，都是一个新世界</span><button class="catalog-button" id="catalog-button">山河目录 <span>${places.length}</span> ${icon('arrow')}</button><div class="carousel-controls"><button id="cards-prev" aria-label="向前浏览目的地">${icon('chevron')}</button><button id="cards-next" aria-label="向后浏览目的地">${icon('chevron')}</button></div></div>
      <div class="destination-track" id="destination-track"></div>
    </section>
    <footer class="map-footer"><span><span class="live-dot"></span> <span id="map-status">正在唤醒山河…</span></span><span class="footer-attribution">© Esri, Vantor, Earthstar Geographics · Mapzen</span><span class="coordinates" id="coordinates">104.00° E &nbsp; 35.00° N</span><button id="sources-button">数据来源与地图说明 ${icon('info')}</button></footer>
    <div class="toast" role="status" aria-live="polite"></div>
  </main>
  <dialog class="search-dialog" aria-labelledby="search-title"><div class="dialog-top"><span id="search-title">寻找你心中的山河</span><button class="icon-button" data-close aria-label="关闭搜索">${icon('close')}</button></div><div class="search-input-wrap">${icon('search')}<input id="search-input" type="search" placeholder="搜索山川、城市、文化地标…" autocomplete="off" aria-label="搜索地点"><kbd>ESC</kbd></div><div class="search-results"></div><p class="search-hint">从 ${places.length} 个精选坐标出发，去认识中国。</p></dialog>
  <dialog class="story-dialog" aria-labelledby="story-title"></dialog>
  <dialog class="catalog-dialog" aria-labelledby="catalog-title"></dialog>
  <dialog class="about-dialog" aria-labelledby="about-title"></dialog>
  <dialog class="photo-dialog" aria-labelledby="photo-title"><div class="dialog-top"><span id="photo-title"></span><button class="icon-button" data-close aria-label="关闭照片">${icon('close')}</button></div><div class="photo-viewer-content"></div><div class="photo-viewer-controls"><button id="photo-prev" aria-label="上一张照片">${icon('chevron')}</button><span id="photo-count" role="status" aria-live="polite"></span><button id="photo-next" aria-label="下一张照片">${icon('chevron')}</button></div></dialog>
`;

function filteredPlaces() { return places.filter(p => state.category === 'all' || p.category === state.category); }
function cardMarkup(p, i) { return `<button class="destination-card ${state.selected === p.id ? 'selected' : ''}" data-place="${p.id}" aria-labelledby="card-title-${p.id}"><img src="${thumbnail(p)}" alt="" width="480" height="300" decoding="async" fetchpriority="low" loading="${i < 5 ? 'eager' : 'lazy'}"><span class="card-shade"></span><span class="card-order" aria-hidden="true">${String(places.indexOf(p) + 1).padStart(2, '0')}</span><span class="card-tag" aria-hidden="true">${p.category === 'culture' ? '人文足迹' : '自然奇境'}</span><span class="card-title"><span id="card-title-${p.id}"><strong>${p.name}</strong><small>${p.en.toUpperCase()}</small></span><span class="card-arrow">${icon('arrow')}</span></span></button>`; }
function renderCards(visibleOnly = false) {
  const cards = filteredPlaces();
  $('#destination-track').innerHTML = (visibleOnly ? cards.slice(0, 5) : cards).map(cardMarkup).join('');
  $('#destination-track').querySelectorAll('[data-place]').forEach(b => b.onclick = () => selectPlace(b.dataset.place));
  updatePlaceMarkers?.(state);
  scheduleMarkers();
}

function completeCards() {
  const track = $('#destination-track');
  const start = track.childElementCount;
  const remaining = filteredPlaces().slice(start);
  if (!remaining.length) return;
  track.insertAdjacentHTML('beforeend', remaining.map((p, i) => cardMarkup(p, start + i)).join(''));
  track.querySelectorAll('[data-place]').forEach(b => b.onclick = () => selectPlace(b.dataset.place));
}

function safeText(text) { const el = document.createElement('span'); el.textContent = text; return el.innerHTML.replaceAll('"', '&quot;'); }
function showToast(message) { $('.toast').textContent = message; $('.toast').classList.add('visible'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => $('.toast').classList.remove('visible'), 3200); }
function photoCredit(c) { return `<a href="${c.sourceUrl}" target="_blank" rel="noopener noreferrer">摄影：${safeText(c.author)}</a> · <a href="${c.licenseUrl}" target="_blank" rel="noopener noreferrer">${safeText(c.license)}</a><br>图片经缩放与压缩，原作及许可见链接。`; }
function placeGallery(p) { return [{ ...photos[p.id], file: p.image, caption: photos[p.id]?.location || p.name, alt: photos[p.id]?.location || `${p.name}风光` }, detailPhotos[p.id]].filter(Boolean); }
function renderPhoto() {
  const gallery = placeGallery(photoPlace);
  const photo = gallery[photoIndex];
  $('#photo-title').textContent = `${photoPlace.name} / 山河影像`;
  $('.photo-viewer-content').innerHTML = `<figure><img src="${assetUrl(photo.file)}" alt="${safeText(photo.alt)}"><figcaption>${safeText(photo.caption)}</figcaption></figure><p class="photo-credit">${photo.author ? photoCredit(photo) : '摄影资料载入中…'}</p>`;
  $('#photo-count').textContent = `${String(photoIndex + 1).padStart(2, '0')} / ${String(gallery.length).padStart(2, '0')}`;
}
function openPhoto(p, index) {
  stopTour(); photoPlace = p; photoIndex = index; renderPhoto();
  $('.photo-dialog').showModal();
}
function stepPhoto(direction) { photoIndex = (photoIndex + direction + placeGallery(photoPlace).length) % placeGallery(photoPlace).length; renderPhoto(); }
function setReadingExpanded(expanded) {
  const panel = $('.place-panel');
  panel.classList.toggle('reading-expanded', expanded);
  $('.reading-toggle').setAttribute('aria-expanded', String(expanded));
  $('.reading-toggle').innerHTML = `${expanded ? '收起阅读' : '展开阅读'} ${icon('down')}`;
  if (expanded) stopTour();
}
function renderPlace(p, preserveReading = false) {
  loadPhotography();
  $('.intro').classList.add('dismissed');
  const panel = $('.place-panel');
  const scrollTop = preserveReading ? $('.place-scroll')?.scrollTop || 0 : 0;
  panel.classList.remove('landform-detail');
  panel.classList.add('place-reading');
  if (!preserveReading) panel.classList.remove('reading-expanded');
  panel.hidden = false;
  const story = placeStories[p.id];
  const detail = detailPhotos[p.id];
  const detailFigure = detail ? `<figure class="place-photo"><button data-photo="1" aria-label="查看${p.name}第二张照片"><img src="${assetUrl(detail.file)}" alt="${safeText(detail.alt)}" loading="lazy" width="${detail.width}" height="${detail.height}"><span>${icon('full')} 查看大图</span></button><figcaption><span>02 / 风景细读</span>${safeText(detail.caption)}</figcaption><details class="photo-attribution"><summary>摄影与许可</summary><p class="photo-credit">${photoCredit(detail)}</p></details></figure>` : '';
  panel.innerHTML = `<div class="place-toolbar"><span>地点手记 <small>/ FIELD NOTES</small></span><button class="reading-toggle" aria-expanded="false" aria-controls="place-reading-content">展开阅读 ${icon('down')}</button><button class="panel-back" aria-label="返回中国全景">${icon('close')}</button></div><div class="place-scroll" id="place-reading-content"><div class="place-cover"><img src="${assetUrl(p.image)}" alt="${safeText(placeGallery(p)[0].alt)}" decoding="async"><div class="place-cover-shade"></div><button class="cover-photo-button" data-photo="0" aria-label="查看${p.name}第一张照片"><span>${icon('full')} 查看照片</span></button><span class="place-category">${p.category === 'culture' ? '人文足迹 · CULTURE' : '自然奇境 · NATURE'}</span><h2>${p.name}<small>${p.en.toUpperCase()}</small></h2></div><div class="place-body"><div class="place-location">${icon('pin')} ${p.region}<span>${p.coordinate[1].toFixed(2)}° N / ${p.coordinate[0].toFixed(2)}° E</span></div><p class="place-kicker">${p.kicker}</p><h3>${p.title}</h3><p class="place-description">${p.description}</p><div class="place-stats">${p.stats.map(s => `<div><strong>${s.value}</strong><small>${s.label}</small></div>`).join('')}</div><div class="place-paragraphs"><section class="place-chapter"><h4><span>01</span>${story.chapterTitles[0]}</h4><p>${p.paragraphs[0]}</p></section>${detailFigure}<section class="place-chapter"><h4><span>02</span>${story.chapterTitles[1]}</h4><p>${p.paragraphs[1]}</p></section><section class="place-observation"><span class="observation-label">${icon('compass')} 观察手记</span><h4>在这里，看见什么</h4><p>${story.observation}</p></section></div><div class="place-tags">${p.tags.map(t => `<span>${t}</span>`).join('')}</div><a class="place-source" href="${p.source.url}" target="_blank" rel="noopener noreferrer">延伸阅读 · ${p.source.label} ${icon('arrow')}</a><details class="photo-attribution cover-attribution"><summary>封面摄影与许可</summary><p class="photo-credit">${photos[p.id] ? photoCredit(photos[p.id]) : '摄影资料载入中…'}</p></details></div></div>`;
  $('.panel-back').onclick = resetView;
  $('.reading-toggle').onclick = () => setReadingExpanded(!panel.classList.contains('reading-expanded'));
  if (panel.classList.contains('reading-expanded')) setReadingExpanded(true);
  panel.querySelectorAll('[data-photo]').forEach(b => b.onclick = () => openPhoto(p, Number(b.dataset.photo)));
  if (preserveReading && scrollTop) $('.place-scroll').scrollTop = scrollTop;
}

function selectPlace(id, fromTour = false) {
  const p = places.find(p => p.id === id);
  if (!p) return;
  if (state.category !== 'all' && p.category !== state.category) changeCategory('all');
  if (!fromTour) stopTour();
  state.landform = null; landforms?.clear();
  $('#landform-select').value = '';
  state.selected = p.id;
  renderPlace(p);
  updateCardSelection();
  updatePlaceMarkers?.(state);
  const sequence = ++cameraSequence;
  if (map && state.mapReady) requestAnimationFrame(() => setTimeout(() => {
    if (sequence !== cameraSequence || state.selected !== p.id) return;
    map.flyTo({ center: p.coordinate, zoom: p.zoom, pitch: state.terrain ? p.pitch : 0, bearing: -18, padding: mapPadding(), duration: reducedMotion ? 0 : 2600, essential: true });
  }, 0));
  $('.map-caption').innerHTML = `<span class="live-dot"></span> ${p.name} <span class="caption-divider">/</span><span id="map-mode">${state.terrain ? '三维地形已开启' : '平面地图'}</span>`;
  history.replaceState(null, '', `#${p.id}`);
}

function selectLandform(feature) {
  if (!feature) return;
  stopTour(); state.selected = null; state.landform = feature.properties.id;
  const p = feature.properties;
  setLandformVisible(p.kind, true);
  landforms.select(feature);
  updatePlaceMarkers?.(state);
  $('.intro').classList.add('dismissed');
  const panel = $('.place-panel');
  panel.classList.remove('place-reading', 'reading-expanded');
  panel.hidden = false; panel.classList.add('landform-detail'); panel.scrollTop = 0;
  panel.innerHTML = `<div class="landform-heading"><span class="landform-eyebrow"><i class="${p.kind === 'mountain' ? 'mountain' : 'river'}-key"></i>${p.kind === 'mountain' ? '大地的骨架 / MOUNTAIN RANGES' : '大地的脉络 / RIVER SYSTEMS'}</span><button class="panel-back" aria-label="返回中国全景">${icon('close')}</button><h2>${safeText(p.name)}<small>${safeText(p.name_en)}</small></h2></div><div class="place-body"><p class="landform-description">${safeText(p.description)}</p>${p.direction ? `<div class="landform-fact"><span>总体走向</span>${safeText(p.direction)}</div>` : ''}${p.basin ? `<div class="landform-fact"><span>所属水系</span>${safeText(p.basin)}</div>` : ''}<p class="landform-precision">${safeText(p.precision_note)}</p><a class="place-source" href="${p.source}" target="_blank" rel="noopener noreferrer">${p.kind === 'mountain' ? '地理资料与延伸阅读' : '水系数据与比例尺说明'} ${icon('arrow')}</a><p class="landform-interaction">拖动、旋转地图，观察山河之间的关系。</p></div>`;
  $('.panel-back').onclick = resetView;
  updateCardSelection();
  map.fitBounds(landformBounds(feature), { padding: mapPadding(), absolutePadding: true, maxZoom: 6.5, pitch: state.terrain ? 40 : 0, bearing: -8, duration: reducedMotion ? 0 : 1800 });
  $('.map-caption').innerHTML = `<span class="live-dot"></span> ${safeText(p.name)} <span class="caption-divider">/</span><span id="map-mode">${state.terrain ? '三维地形已开启' : '平面地图'}</span>`;
  $('.layer-picker').hidden = true; $('#layers-button').setAttribute('aria-expanded', 'false'); $('#layers-button').classList.remove('active');
  $('#landform-select').value = p.id;
  history.replaceState(null, '', location.pathname);
}

function setLandformVisible(kind, visible) {
  state[kind === 'mountain' ? 'mountains' : 'rivers'] = visible;
  $(`#${kind}-toggle`).checked = visible;
  $(`[data-landform-kind="${kind}"]`).setAttribute('aria-pressed', String(visible));
  landforms?.setVisible(kind, visible);
  scheduleMarkers();
}

function mapPadding() {
  if (innerWidth > 800) return { left: $('.place-panel').getBoundingClientRect().right + 24, right: 90, top: 110, bottom: 270 };
  const mapRect = $('#map').getBoundingClientRect();
  const panel = $('.place-panel');
  const style = getComputedStyle(panel);
  const panelTop = panel.classList.contains('reading-expanded') ? mapRect.height - parseFloat(style.getPropertyValue('--place-compact-bottom')) - parseFloat(style.getPropertyValue('--place-compact-height')) : panel.getBoundingClientRect().top - mapRect.top;
  return { left: 15, right: 55, top: $('.tour-player').hidden ? 135 : 188, bottom: Math.max(235, mapRect.height - panelTop + 24) };
}
function resetView() {
  stopTour(); state.selected = null; state.landform = null; landforms?.clear();
  $('.place-panel').hidden = true; $('.place-panel').classList.remove('landform-detail', 'place-reading', 'reading-expanded'); $('.intro').classList.remove('dismissed');
  $('#landform-select').value = '';
  updatePlaceMarkers?.(state);
  updateCardSelection();
  if (map && state.mapReady) map.easeTo({ ...overviewCamera(), duration: reducedMotion ? 0 : 2200 });
  $('.map-caption').innerHTML = `<span class="live-dot"></span> 中国全景 <span class="caption-divider">/</span><span id="map-mode">${state.terrain ? '三维地形已开启' : '平面地图'}</span>`;
  history.replaceState(null, '', location.pathname);
}

function changeCategory(category) {
  stopTour(); state.category = category;
  $('.main-nav').querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === category));
  $('#discover-title').textContent = { all: '循着山河，遇见中国', nature: '自然造化，自有回响', culture: '山河为卷，文明为章' }[category];
  $('#discover-note').textContent = category === 'all' ? '每一个坐标，都是一个新世界' : `${filteredPlaces().length} 个精选坐标 · ${category === 'nature' ? '大地的自然史诗' : '土地上的千年故事'}`;
  renderCards(); $('#destination-track').scrollTo({ left: 0 });
  if (state.selected && !filteredPlaces().some(p => p.id === state.selected)) resetView();
}

function startTour(ids = highlights) {
  if (state.category !== 'all') changeCategory('all');
  if (!state.mapReady) return showToast('地图正在载入，请稍候片刻');
  stopTour(); state.tour = true; state.tourIds = ids; state.tourIndex = 0;
  $('.tour-player').hidden = false; $('.map-gesture').hidden = true;
  tourStep();
}
function tourStep() {
  clearTimeout(tourTimer);
  const p = places.find(p => p.id === state.tourIds[state.tourIndex]);
  selectPlace(p.id, true);
  $('#tour-place').textContent = p.name; $('#tour-count').textContent = `${String(state.tourIndex + 1).padStart(2, '0')} / ${state.tourIds.length}`;
  $('#tour-pause').innerHTML = icon('pause'); $('#tour-pause').setAttribute('aria-label', '暂停漫游');
  $('.tour-progress').classList.remove('running'); void $('.tour-progress').offsetWidth; $('.tour-progress').classList.add('running');
  tourTimer = setTimeout(nextTour, 11000);
}
function nextTour() { state.tourIndex++; if (state.tourIndex >= state.tourIds.length) { stopTour(); showToast('山河之旅已完成。继续探索你心中的中国。'); } else { state.tour = true; tourStep(); } }
function stopTour() { clearTimeout(tourTimer); state.tour = false; $('.tour-player').hidden = true; $('.map-gesture').hidden = false; $('.tour-progress').classList.remove('running'); }

function openSearch() { renderSearch(''); $('.search-dialog').showModal(); $('#search-input').value = ''; $('#search-input').focus(); }
function matchesQuery(p, query) {
  return `${p.name} ${p.en} ${p.id} ${searchAliases[p.id] || ''} ${(p.aliases || []).join(' ')} ${p.province} ${p.region} ${p.tags.join(' ')} ${p.description}`.toLowerCase().includes(query.trim().toLowerCase());
}
function renderSearch(query) {
  const found = places.filter(p => matchesQuery(p, query));
  $('.search-results').innerHTML = found.length ? found.map(p => `<button data-place="${p.id}"><img src="${thumbnail(p)}" alt="" loading="lazy" decoding="async"><span><strong>${p.name}</strong><small>${p.region} · ${p.tags[0]}</small></span><span class="result-category">${p.category === 'culture' ? '人文' : '自然'}</span>${icon('arrow')}</button>`).join('') : `<div class="empty-search">${icon('compass')}<h3>这里还没有收录这个坐标</h3><p>试试「珠峰」「桂林」「长城」或「高原」。</p></div>`;
  $('.search-results').querySelectorAll('[data-place]').forEach(b => b.onclick = () => { $('.search-dialog').close(); selectPlace(b.dataset.place); });
}

function openCatalog() {
  catalog.theme = 'all'; catalog.province = 'all'; catalog.query = '';
  $('.catalog-dialog').innerHTML = `<div class="catalog-sticky"><div class="dialog-top"><span>山河目录 / FIELD GUIDE</span><button class="icon-button" data-close aria-label="关闭山河目录">${icon('close')}</button></div><div class="catalog-intro"><div><span class="eyebrow">${provinceNames.length} 个省级行政区 · ${themes.length} 类地理线索</span><h2 id="catalog-title">中国，远不止一种风景。</h2></div><span class="catalog-total">${places.length}<small>个山河坐标</small></span></div><div class="catalog-themes" aria-label="按主题筛选"><button data-theme="all" class="active" aria-pressed="true">全部山河 <span>${places.length}</span></button>${themes.map(t => `<button data-theme="${t.id}" aria-pressed="false">${t.label} <span>${places.filter(p => p.theme === t.id).length}</span></button>`).join('')}</div><div class="catalog-filters"><label class="catalog-search">${icon('search')}<input id="catalog-search" type="search" placeholder="搜索山川、古城与文化地标…" aria-label="搜索山河目录"></label><select id="catalog-province" aria-label="按省级行政区筛选"><option value="all">全部地区 · ${provinceNames.length}</option>${provinceNames.map(name => `<option>${name}</option>`).join('')}</select></div></div><div class="catalog-results-heading" role="status" aria-live="polite"></div><div class="catalog-grid"></div>`;
  $('.catalog-dialog [data-close]').onclick = () => $('.catalog-dialog').close();
  $('.catalog-themes').querySelectorAll('button').forEach(b => b.onclick = () => { catalog.theme = b.dataset.theme; $('.catalog-themes').querySelectorAll('button').forEach(el => { el.classList.toggle('active', el === b); el.setAttribute('aria-pressed', String(el === b)); }); renderCatalog(); });
  $('#catalog-search').oninput = e => { catalog.query = e.target.value; renderCatalog(); };
  $('#catalog-province').onchange = e => { catalog.province = e.target.value; renderCatalog(); };
  renderCatalog(); $('.catalog-dialog').showModal();
}

function renderCatalog() {
  const found = places.filter(p => (catalog.theme === 'all' || p.theme === catalog.theme) && (catalog.province === 'all' || p.province === catalog.province) && matchesQuery(p, catalog.query));
  $('.catalog-results-heading').textContent = `${catalog.province === 'all' ? '辽阔中国' : catalog.province} / ${themes.find(t => t.id === catalog.theme)?.label || '全部山河'} · ${found.length} 个坐标`;
  $('.catalog-dialog').scrollTop = 0;
  $('.catalog-grid').innerHTML = found.length ? found.map(p => `<button class="catalog-card" data-place="${p.id}"><div class="catalog-image"><img src="${thumbnail(p)}" alt="" loading="lazy" decoding="async"><span>${themes.find(t => t.id === p.theme).label}</span></div><div class="catalog-card-body"><small>${p.region}</small><strong>${p.name} ${icon('arrow')}</strong><p>${p.description}</p></div></button>`).join('') : `<div class="empty-search">${icon('compass')}<h3>这条线索下还没有找到坐标</h3><p>换一个主题、地区或搜索词，继续发现山河。</p><button class="catalog-clear">清除筛选 ${icon('arrow')}</button></div>`;
  $('.catalog-grid').querySelectorAll('[data-place]').forEach(b => b.onclick = () => { $('.catalog-dialog').close(); selectPlace(b.dataset.place); });
  const clear = $('.catalog-clear'); if (clear) clear.onclick = openCatalog;
}

function openChapters() {
  $('.story-dialog').innerHTML = `<div class="dialog-top"><span>山河专题 / EDITORIAL JOURNEYS</span><button class="icon-button" data-close aria-label="关闭专题">${icon('close')}</button></div><div class="story-intro"><span class="eyebrow">换一个角度，理解脚下的土地</span><h2 id="story-title">中国，是怎样的中国？</h2><p>${chapters.length} 条主题路线，${places.length} 个山河坐标。让镜头带你读懂自然与文明的相遇。</p></div><div class="chapter-grid">${chapters.map((c, i) => `<button class="chapter-card" data-chapter="${i}"><img src="${assetUrl(places.find(p => p.id === c.placeIds[0])?.image || '/images/hero.jpg')}" alt="" loading="lazy"><div></div><span class="chapter-number">${c.number}</span><span class="chapter-content"><small>${c.en}</small><strong>${c.title}</strong><p>${c.intro || c.description}</p><span>${c.placeIds.length} 站 · 约 ${Math.round(c.placeIds.length * 11 / 60)} 分钟 ${icon('arrow')}</span></span></button>`).join('')}</div>`;
  $('.story-dialog').querySelector('[data-close]').onclick = () => $('.story-dialog').close();
  $('.story-dialog').querySelectorAll('[data-chapter]').forEach(b => b.onclick = () => { $('.story-dialog').close(); startTour(chapters[Number(b.dataset.chapter)].placeIds); });
  $('.story-dialog').showModal();
}

async function openAbout(showSources = false) {
  const sourceLinks = [...new Map([...sources, ...places.map(p => p.source)].map(s => [s.url, s])).values()];
  $('.about-dialog').innerHTML = `<div class="dialog-top"><span>山河志 / ABOUT THIS ATLAS</span><button class="icon-button" data-close aria-label="关闭说明">${icon('close')}</button></div><div class="about-content"><div class="eyebrow">让辽阔，变得可亲近</div><h2 id="about-title">每一次看见，<br>都是重新认识。</h2><p>山河志是一部可以探索的中国地理图鉴。以真实的地理数据为底，以山川与文明的故事为线索，邀请你从世界屋脊一路走向江海之滨。现收录 ${places.length} 个代表坐标、${chapters.length} 条主题旅程，覆盖 ${provinceNames.length} 个省级行政区。</p><h3 id="data-notes">数据与地图说明</h3><ul><li>卫星影像与地形晕渲：Esri ArcGIS World Imagery / World Shaded Relief；影像来源包括 Esri、Vantor、Earthstar Geographics 及 GIS User Community，日期因区域而异。</li><li>三维地形：Mapzen / AWS Terrain Tiles，Terrarium 编码。为便于观察，地形垂直起伏放大 1.5 倍。</li><li>行政区划：阿里云 DataV GeoAtlas，包含 34 个省级行政区。边界为概略数据，近景自动隐去，不用于测绘、导航或行政认定。</li><li>地点坐标采用 WGS84，表示叙事代表位置。珠峰数值为 2020 年公布的雪面高程。</li><li>水系：Natural Earth 1:1000万河流与湖泊中心线，公有领域。按河段名称与水系归属组织；保留源数据的湖区断段和跨境延伸，是全国/区域概览，不代表精确河岸。近景渐隐。</li><li>山系：24 条手工概化的总体走向示意轴线，依公开地理资料整理；暖金虚线不代表精确山脊、山系边界或登山路线。山系与水系均支持点击介绍及按名称定位。</li><li>全景与常用地点附近的部分影像、地形随站点提供；超出覆盖范围或继续放大时需联网。</li></ul><h3>延伸阅读与参考资料</h3><div class="reference-links">${sourceLinks.map(s => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label || s.name || s.title} ${icon('arrow')}</a>`).join('')}<a href="https://geo.datav.aliyun.com/" target="_blank" rel="noopener noreferrer">阿里云 DataV GeoAtlas ${icon('arrow')}</a><a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">地形数据归属与许可 ${icon('arrow')}</a></div><h3>山系与水系资料</h3><div class="reference-links"><a href="https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/" target="_blank" rel="noopener noreferrer">Natural Earth · 1:1000万水系数据 ${icon('arrow')}</a><a href="./data/mountains.geojson" target="_blank" rel="noopener noreferrer">24条山系 · 逐条参考资料与精度说明 ${icon('arrow')}</a><a href="./data/rivers.geojson" target="_blank" rel="noopener noreferrer">水系 · 逐条来源与河段说明 ${icon('arrow')}</a></div><h3>摄影来源</h3><div class="photo-sources">正在读取摄影资料…</div><p class="about-footer">独立地理科普项目 · 设计致意地理影像与科学叙事<br>本项目与星球研究所无关联。</p></div>`;
  $('.about-dialog').querySelector('[data-close]').onclick = () => $('.about-dialog').close();
  $('.about-dialog').showModal();
  if (showSources) $('#data-notes').scrollIntoView({ block: 'start' });
  try {
    await loadPhotography();
    const entries = [...Object.values(photos), ...Object.values(detailPhotos)];
    $('.photo-sources').innerHTML = entries.map(s => `<div><a href="${s.sourceUrl || s.source || s.url || s.originalUrl || '#'}" target="_blank" rel="noopener noreferrer">${safeText(s.title || s.id || '')}</a><span>${safeText(s.author || s.credit || '')} · <a href="${s.licenseUrl || s.sourceUrl}" target="_blank" rel="noopener noreferrer">${safeText(s.license || '')}</a> · 经缩放与压缩</span></div>`).join('');
  } catch { $('.photo-sources').textContent = '摄影资料暂未载入，请稍后重试。'; }
}

function bindUI() {
  document.querySelectorAll('button[aria-label]').forEach(b => { b.title = b.getAttribute('aria-label'); });
  $('.brand').onclick = e => { e.preventDefault(); changeCategory('all'); resetView(); };
  $('.main-nav').querySelectorAll('[data-category]').forEach(b => b.onclick = () => changeCategory(b.dataset.category));
  $('#explore-button').onclick = () => selectPlace('everest');
  $('#intro-tour').onclick = () => startTour();
  $('#chapters-button').onclick = openChapters;
  $('#catalog-button').onclick = openCatalog;
  $('.search-toggle').onclick = openSearch;
  $('#search-input').oninput = e => renderSearch(e.target.value);
  $('#about-button').onclick = () => openAbout(); $('#sources-button').onclick = () => openAbout(true);
  document.querySelectorAll('dialog').forEach(dialog => { dialog.addEventListener('click', e => { if (e.target === dialog) { const b = dialog.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close(); } }); });
  $('.search-dialog [data-close]').onclick = () => $('.search-dialog').close();
  $('.photo-dialog [data-close]').onclick = () => $('.photo-dialog').close();
  $('#photo-prev').onclick = () => stepPhoto(-1); $('#photo-next').onclick = () => stepPhoto(1);
  $('.photo-dialog').addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(e.key === 'ArrowLeft' ? -1 : 1); } });
  $('#cards-prev').onclick = () => $('#destination-track').scrollBy({ left: -470, behavior: reducedMotion ? 'instant' : 'smooth' });
  $('#cards-next').onclick = () => { completeCards(); $('#destination-track').scrollBy({ left: 470, behavior: reducedMotion ? 'instant' : 'smooth' }); };
  $('#layers-button').onclick = () => { const picker = $('.layer-picker'); picker.hidden = !picker.hidden; $('#layers-button').classList.toggle('active', !picker.hidden); $('#layers-button').setAttribute('aria-expanded', String(!picker.hidden)); };
  $('#zoom-in').onclick = () => map?.zoomIn(); $('#zoom-out').onclick = () => map?.zoomOut();
  $('#north-button').onclick = () => map?.easeTo({ bearing: 0, duration: reducedMotion ? 0 : 700 });
  $('#home-button').onclick = resetView;
  $('#terrain-button').onclick = () => { if (!state.mapReady) return; state.terrain = !state.terrain; map.setTerrain(state.terrain ? { source: 'terrain', exaggeration: 1.5 } : null); map.easeTo({ pitch: state.terrain ? 55 : 0, duration: reducedMotion ? 0 : 1000 }); $('#terrain-button').classList.toggle('is-active', state.terrain); $('#terrain-button').setAttribute('aria-pressed', String(state.terrain)); $('#map-mode').textContent = state.terrain ? '三维地形已开启' : '平面地图'; };
  $('#fullscreen-button').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { showToast('当前浏览器暂不支持全屏模式'); } };
  document.addEventListener('fullscreenchange', () => { $('#fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'); map?.resize(); });
  $('.basemap-options').querySelectorAll('button').forEach(b => b.onclick = () => { if (!state.mapReady) return; state.layer = b.dataset.layer; map.setLayoutProperty('satellite', 'visibility', state.layer === 'satellite' ? 'visible' : 'none'); map.setLayoutProperty('relief', 'visibility', state.layer === 'relief' ? 'visible' : 'none'); $('.basemap-options').querySelectorAll('button').forEach(el => el.classList.toggle('active', el === b)); });
  $('#border-toggle').onchange = e => { state.borders = e.target.checked; applyBorders(); };
  $('#river-toggle').onchange = e => setLandformVisible('river', e.target.checked);
  $('#mountain-toggle').onchange = e => setLandformVisible('mountain', e.target.checked);
  $('.landform-legend').querySelectorAll('button').forEach(b => b.onclick = () => setLandformVisible(b.dataset.landformKind, b.getAttribute('aria-pressed') !== 'true'));
  $('#landform-select').onchange = e => selectLandform(landforms?.features.find(f => f.properties.id === e.target.value));
  $('#tour-close').onclick = stopTour; $('#tour-next').onclick = () => { clearTimeout(tourTimer); nextTour(); };
  $('#tour-pause').onclick = () => { if (state.tour) { clearTimeout(tourTimer); map?.stop(); state.tour = false; $('.tour-progress').classList.remove('running'); $('#tour-pause').innerHTML = icon('play'); $('#tour-pause').setAttribute('aria-label', '继续漫游'); } else { state.tour = true; tourStep(); } };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { $('.layer-picker').hidden = true; $('#layers-button').setAttribute('aria-expanded', 'false'); if (state.selected || state.landform) resetView(); } if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { e.preventDefault(); if (!$('.search-dialog').open) openSearch(); } });
  let wasWide = innerWidth > 800;
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (places.some(p => p.id === id)) selectPlace(id); else if (!id) resetView(); });
  window.addEventListener('resize', () => {
    map?.resize();
    if (!state.mapReady || wasWide === (innerWidth > 800)) return;
    wasWide = innerWidth > 800;
    if (state.selected) { const p = places.find(p => p.id === state.selected); map.jumpTo({ center: p.coordinate, padding: mapPadding() }); }
    else if (state.landform) { const feature = landforms.features.find(f => f.properties.id === state.landform); map.fitBounds(landformBounds(feature), { padding: mapPadding(), absolutePadding: true, maxZoom: 6.5, pitch: state.terrain ? 40 : 0, bearing: -8, duration: 0 }); }
    else map.jumpTo({ center: [103, 35.5], zoom: wasWide ? 3.45 + Math.log2(innerWidth / 1512) : 2.65, padding: wasWide ? { left: 380, right: 85, top: 130, bottom: 260 } : { left: 50, right: 45, top: 160, bottom: 250 } });
  });
}

function updateCardSelection() {
  $('#destination-track').querySelectorAll('[data-place]').forEach(b => b.classList.toggle('selected', b.dataset.place === state.selected));
}

function applyBorders() {
  if (!state.mapReady) return;
  if (state.borders && !provincesLoaded) {
    map.getSource('provinces').setData(assetUrl('/data/china-provinces.geojson'));
    provincesLoaded = true;
  }
  map.setLayoutProperty('provinces', 'visibility', state.borders ? 'visible' : 'none');
}

function placeCamera(p) {
  return { center: p.coordinate, zoom: p.zoom, pitch: state.terrain ? p.pitch : 0, bearing: -18, padding: mapPadding() };
}

function overviewCamera() {
  const wide = innerWidth > 800;
  return { center: [103, 35.5], zoom: wide ? 3.45 + Math.log2(innerWidth / 1512) : 2.65, padding: wide ? { left: 380, right: 85, top: 130, bottom: 260 } : { left: 50, right: 45, top: 160, bottom: 250 }, pitch: state.terrain ? 38 : 0, bearing: -8 };
}

async function initMap() {
  try {
    maplibregl = await mapEngine;
    installTileProtocol(maplibregl, { baseURL: new URL(import.meta.env.BASE_URL, location.href).href });
    const coverageReady = fetch(assetUrl('/data/tiles-detail.json'), { signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.json() : {}).then(setDetailTileCoverage).catch(() => {});
    const geographyReady = loadLandformData();
    geographyReady.catch(() => {});
    const linkedPlace = places.find(p => p.id === (state.selected || location.hash.slice(1)));
    if (linkedPlace && !state.selected) { state.selected = linkedPlace.id; renderPlace(linkedPlace); updateCardSelection(); }
    // A direct place link needs its sparse tile manifest before requesting close-up tiles.
    if (state.selected) await coverageReady;
    const initialPlace = places.find(p => p.id === state.selected);
    const camera = initialPlace ? placeCamera(initialPlace) : overviewCamera();
    map = new maplibregl.Map({ container: 'map', ...camera, maxPitch: 75, minZoom: 2, maxZoom: 16, maxTileCacheSize: innerWidth <= 800 ? 64 : 128, renderWorldCopies: false, attributionControl: false, canvasContextAttributes: { antialias: true }, style: { version: 8, sources: {
      satellite: { type: 'raster', tiles: ['atlas://satellite/{z}/{x}/{y}'], tileSize: 256, maxzoom: 18, attribution: '© Esri, Vantor, Earthstar Geographics' },
      relief: { type: 'raster', tiles: ['atlas://relief/{z}/{x}/{y}'], tileSize: 256, maxzoom: 13, attribution: '© Esri, USGS, NOAA' },
      terrain: { type: 'raster-dem', tiles: ['atlas://terrain/{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 14, attribution: '© Mapzen, USGS, NASA' },
      'hillshade-terrain': { type: 'raster-dem', tiles: ['atlas://terrain/{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 14 },
      outline: { type: 'geojson', data: assetUrl('/data/china-outline.geojson') },
      provinces: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    }, layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#13272e' } },
      { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-saturation': -.25, 'raster-contrast': .12, 'raster-brightness-max': .84, 'raster-fade-duration': 0 } },
      { id: 'relief', type: 'raster', source: 'relief', layout: { visibility: 'none' }, paint: { 'raster-saturation': -.32, 'raster-brightness-max': .75, 'raster-fade-duration': 0 } },
      { id: 'hillshade', type: 'hillshade', source: 'hillshade-terrain', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': .24, 'hillshade-shadow-color': '#10252e', 'hillshade-highlight-color': '#d6debb', 'hillshade-illumination-direction': 315 } },
      { id: 'country-glow', type: 'line', source: 'outline', maxzoom: 10, paint: { 'line-color': '#e0d6ab', 'line-width': 5, 'line-opacity': .10, 'line-blur': 5 } },
      { id: 'country-outline', type: 'line', source: 'outline', maxzoom: 10, paint: { 'line-color': '#e1d5b3', 'line-width': 1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, .62, 9, .2, 10, 0] } },
      { id: 'provinces', type: 'line', source: 'provinces', maxzoom: 10, layout: { visibility: 'none' }, paint: { 'line-color': '#eee5c9', 'line-width': .65, 'line-opacity': .42 } }
    ], sky: { 'sky-color': '#223438', 'horizon-color': '#9caea5', 'fog-color': '#223b3e', 'fog-ground-blend': .4, 'horizon-fog-blend': .7, 'sky-horizon-blend': .8 } } });
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 95, unit: 'metric' }), 'bottom-right');
    map.once('style.load', () => {
      state.mapReady = true;
      performance.mark('atlas-interactive');
      $('#map-status').textContent = '影像载入中 · 已可探索';
      const currentPlace = places.find(p => p.id === state.selected);
      if (currentPlace?.id !== initialPlace?.id) map.jumpTo(currentPlace ? placeCamera(currentPlace) : overviewCamera());
      if (currentPlace) $('.map-caption').innerHTML = `<span class="live-dot"></span> ${currentPlace.name} <span class="caption-divider">/</span><span id="map-mode">${state.terrain ? '三维地形已开启' : '平面地图'}</span>`;
      applyBorders();
      window.__atlas = { map, state, places, selectPlace, startTour, stopTour, resetView, selectLandform, setLandformVisible, get landforms() { return landforms; } };
    });
    let enhanced = false;
    let enhancementQueued = false;
    const texturedSources = new Set();
    const enhanceMap = () => {
      if (enhanced) return;
      enhanced = true;
      performance.mark('atlas-imagery');
      window.dispatchEvent(new Event('atlas:first-map'));
      completeCards();
      updatePlaceMarkers = addPlaceMarkers(map, places, highlights, selectPlace);
      updatePlaceMarkers(state);
      // Begin detail work after the first raster texture has been presented.
      if (state.terrain) map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
      map.setLayoutProperty('hillshade', 'visibility', 'visible');
      if (!errorNotice) $('#map-status').textContent = state.terrain ? '影像已呈现 · 地形细化中' : '真实影像 · 自由探索';
      addLandforms(map, selectLandform, geographyReady).then(controller => {
        landforms = controller;
        $('#landform-select').innerHTML += ['mountain', 'river'].map(kind => `<optgroup label="${kind === 'mountain' ? '主要山脉' : '主要河流'}">${landforms.features.filter(f => f.properties.kind === kind).map(f => `<option value="${f.properties.id}">${safeText(f.properties.name)}</option>`).join('')}</optgroup>`).join('');
        setLandformVisible('mountain', state.mountains); setLandformVisible('river', state.rivers);
      }).catch(error => { console.warn('Geography layers:', error); showToast('山系与水系暂未载入，请刷新地图重试'); }).finally(() => {
        map.once('idle', () => {
          map.setPaintProperty('satellite', 'raster-fade-duration', 400);
          map.setPaintProperty('relief', 'raster-fade-duration', 300);
          map.once('idle', () => { performance.mark('atlas-ready'); window.dispatchEvent(new Event('atlas:ready')); if (!errorNotice) $('#map-status').textContent = state.terrain ? '真实地形 · 自由探索' : '真实影像 · 自由探索'; });
        });
      });
    };
    const onImageryTile = event => {
      if ((event.sourceId === 'satellite' || event.sourceId === 'relief') && event.tile?.state === 'loaded' && event.tile.texture) texturedSources.add(event.sourceId);
    };
    const onImageryPaint = () => {
      if (!state.mapReady || enhancementQueued || !texturedSources.has(state.layer)) return;
      enhancementQueued = true;
      map.off('sourcedata', onImageryTile);
      map.off('render', onImageryPaint);
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(enhanceMap, 0)));
    };
    map.on('sourcedata', onImageryTile);
    map.on('render', onImageryPaint);
    map.on('move', scheduleMarkers);
    map.on('moveend', scheduleMarkers);
    map.on('resize', scheduleMarkers);
    map.on('render', scheduleMarkers);
    let errorNotice = false;
    map.on('error', e => { console.warn('Map resource:', e.error?.message || e); if (e.sourceId === 'provinces') provincesLoaded = false; if (state.mapReady && !errorNotice && /fetch|network|tile/i.test(e.error?.message || '')) { errorNotice = true; $('#map-status').textContent = '部分高清影像暂不可用 · 可返回全景'; } });
  } catch (error) { completeCards(); console.error(error); $('#map-status').textContent = '浏览器暂不支持三维地图'; showToast('请使用支持 WebGL 的现代浏览器，浏览三维山河'); }
}

function scheduleMarkers() {
  if (!map || markerFrame || markerTimer) return;
  // Native map layers handle labels; only the coordinate readout is throttled.
  markerTimer = setTimeout(() => {
    markerTimer = null;
    markerFrame = requestAnimationFrame(() => { markerFrame = null; lastMarkerUpdate = performance.now(); updateMarkers(); });
  }, Math.max(0, 80 - (performance.now() - lastMarkerUpdate)));
}

function updateMarkers() {
  const c = map.getCenter();
  $('#coordinates').textContent = `${Math.abs(c.lng).toFixed(2)}° ${c.lng >= 0 ? 'E' : 'W'}　 ${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? 'N' : 'S'}`;
  $('.compass-button .icon').style.transform = `rotate(${-map.getBearing()}deg)`;
}

renderCards(true); bindUI();
setTimeout(completeCards, 150);
performance.mark('atlas-shell');
initMap();
function loadPhotography() {
  photographyReady ??= Promise.all(['./data/photo-sources.json', './data/detail-photos-nature.json', './data/detail-photos-culture.json'].map(url => fetch(assetUrl(url), { priority: 'low' }).then(r => { if (!r.ok) throw new Error('Photography metadata unavailable'); return r.json(); }))).then(([covers, nature, culture]) => {
    photos = covers;
    detailPhotos = Object.fromEntries([...nature, ...culture].map(p => [p.id, p]));
    if (state.selected) renderPlace(places.find(p => p.id === state.selected), true);
    if ($('.photo-dialog').open) renderPhoto();
  });
  photographyReady.catch(() => { photographyReady = null; });
  return photographyReady;
}
