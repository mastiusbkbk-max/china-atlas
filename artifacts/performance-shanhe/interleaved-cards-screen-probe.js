// Injected by benchmark.mjs only; never part of the deployed website.
(() => {
  const p = window.__shanhePerf = { pageShows: [], errors: [], longTasks: [] };
  performance.setResourceTimingBufferSize(10000);
  addEventListener('pageshow', e => p.pageShows.push({time:performance.now(), persisted:e.persisted}));
  addEventListener('error', e => p.errors.push(e.message));
  new PerformanceObserver(list => p.longTasks.push(...list.getEntries().map(e=>({startTime:e.startTime,duration:e.duration})))).observe({type:'longtask', buffered:true});
  const painted = callback => requestAnimationFrame(() => requestAnimationFrame(() => callback(performance.now())));
  let atlas;
  function raster(map) {
    const manager = map.style?.tileManagers?.satellite || map.style?.sourceCaches?.satellite;
    const ids = manager?.getRenderableIds?.() || [];
    const tiles = ids.map(id => manager._inViewTiles?.getTileById(id) || manager._tiles?.[id]).filter(Boolean);
    return {renderable:ids.length, textured:tiles.filter(t=>t.texture && t.hasData()).length, loaded:map.isSourceLoaded('satellite'), errors:(manager?._inViewTiles?.getAllTiles?.()||[]).filter(t=>t.state==='errored').length, zooms:[...new Set(tiles.map(t=>t.tileID?.canonical?.z))]};
  }
  function pixels(map) {
    const gl=map.painter.context.gl, values=[];
    for (const [x,y] of [[.4,.4],[.5,.4],[.6,.4],[.4,.5],[.5,.5],[.6,.5],[.4,.6],[.5,.6],[.6,.6]]) {
      const value=new Uint8Array(4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth*x),Math.floor(gl.drawingBufferHeight*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,value);
      values.push([...value]);
    }
    return {values, distinct:new Set(values.map(v=>v.join(','))).size};
  }
  function rendered() {
    const map=atlas.map, now=performance.now();
    if (!p.mapReady) {
      const r=raster(map);
      if (r.textured && !p.firstRaster) {
        const px=pixels(map);
        if(px.distinct>1)p.firstRaster={time:now,...r,...px};
      }
      if(p.firstRaster && r.loaded && !r.errors && !p.pending && map.dragPan.isEnabled() && map.scrollZoom.isEnabled()) {
        p.pending=true;
        painted(time=>{p.mapReady={time,renderTime:now,...r};});
      }
    }
    if (!p.fullReady && !p.fullPending) {
      const counts = id => {
        const raw = map.getStyle().sources[id]?.data;
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return value?.features?.length || 0;
      };
      const nativeLabels = !!map.getSource('places');
      const labels = nativeLabels ? { total: counts('places'), geographies: counts('geography-names'), native: true } : { total: document.querySelectorAll('.map-marker').length, geographies: document.querySelectorAll('.geography-label').length, native: false };
      const labelsReady = labels.total === 81 && labels.geographies === 9 && (!nativeLabels || (map.isSourceLoaded('places') && map.isSourceLoaded('geography-names')));
      if(labelsReady && map.getTerrain() && atlas.landforms?.features?.length && !map.isMoving() && map.areTilesLoaded()) {
        p.fullPending=true;
        painted(time=>{p.fullReady={time,renderTime:now,features:atlas.landforms.features.length,labels,terrain:map.getTerrain(),zoom:map.getZoom(),pitch:map.getPitch()};});
      }
    }
  }
  Object.defineProperty(window,'__atlas',{configurable:true,get:()=>atlas,set:value=>{
    atlas=value;p.api=performance.now();value.map.on('render',rendered);
    const gl=value.map.painter.context.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');
    p.gpu={vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl:gl.getParameter(gl.VERSION),dpr:devicePixelRatio,canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  }});
  p.snapshot=()=>({...p,navigation:performance.getEntriesByType('navigation').map(n=>n.toJSON()),marks:performance.getEntriesByType('mark').map(m=>({name:m.name,time:m.startTime})),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,startTime:r.startTime,responseEnd:r.responseEnd,duration:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,initiatorType:r.initiatorType}))});
  p.armClick=selector=>{
    p.click={selector};
    document.addEventListener('click',e=>{
      if(!e.target.closest(selector))return;
      p.click.event=performance.now();p.click.eventTimeStamp=e.timeStamp;
      const observer=new MutationObserver(()=>{
        const panel=document.querySelector('.place-panel');
        if(panel&&!panel.hidden&&panel.textContent.includes('珠穆朗玛峰')) {
          p.click.dom=performance.now();observer.disconnect();
          painted(time=>{p.click.paint=time;p.click.feedbackMs=time-p.click.eventTimeStamp;p.click.domMs=p.click.dom-p.click.eventTimeStamp;});
        }
      });
      observer.observe(document.querySelector('.place-panel'),{attributes:true,childList:true,subtree:true});
    },{capture:true,once:true});
  };
  p.sampleFrames=duration=>new Promise(resolve=>{
    const raf=[],rendered=[],start=performance.now(),map=atlas.map;
    const onRender=()=>rendered.push(performance.now());
    map.on('render',onRender);
    const frame=t=>{raf.push(t);if(t-start<duration)requestAnimationFrame(frame);else{map.off('render',onRender);resolve({duration,raf,rendered});}};
    requestAnimationFrame(frame);
    map.easeTo({bearing:map.getBearing()+25,zoom:map.getZoom()+.2,duration,easing:t=>t});
  });
})();
