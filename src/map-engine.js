import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// Download and start the renderer while the atlas content is still loading.
export const mapEngine = import('maplibre-gl').then(engine => {
  engine.setWorkerUrl(workerUrl);
  engine.setWorkerCount(navigator.hardwareConcurrency >= 4 ? 2 : 1);
  engine.setMaxParallelImageRequests(32);
  engine.prewarm();
  return engine;
});
