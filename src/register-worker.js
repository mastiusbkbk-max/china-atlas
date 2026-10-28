let scheduled = false;
let activeWorker;
let resourcesReady = false;
let warming = false;

export function warmAtlasResources() {
  resourcesReady = true;
  if (!activeWorker || warming) return;
  warming = true;
  const root = new URL(import.meta.env.BASE_URL, location.href);
  const urls = performance.getEntriesByType('resource').filter(entry => {
    const url = new URL(entry.name);
    const path = url.pathname.slice(root.pathname.length);
    return entry.responseEnd > 0 && url.origin === root.origin && url.pathname.startsWith(root.pathname) &&
      /^(assets|data|fonts|tiles)\/|^images\/thumbs\//.test(path);
  }).map(entry => entry.name);
  const channel = new MessageChannel();
  channel.port1.onmessage = event => {
    if (event.data?.type === 'CACHE_READY') performance.mark(event.data.cached === event.data.requested ? 'atlas-cache-ready' : 'atlas-cache-partial', { detail: event.data });
    channel.port1.close();
  };
  activeWorker.postMessage({ type: 'CACHE_URLS', urls }, [channel.port2]);
}

// Called after the map is visible. First-open rendering never waits for this cache.
export function registerAtlasWorker() {
  if (scheduled || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  scheduled = true;
  const start = async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL, updateViaCache: 'none'
      });
      // navigator.serviceWorker.ready can refer to an ancestor scope during preview installation.
      const worker = registration.active || registration.installing || registration.waiting;
      if (!worker) return;
      if (worker.state !== 'activated') await new Promise((resolve, reject) => {
        const changed = () => {
          if (worker.state !== 'activated' && worker.state !== 'redundant') return;
          worker.removeEventListener('statechange', changed);
          worker.state === 'activated' ? resolve() : reject(new Error('Offline cache installation failed'));
        };
        worker.addEventListener('statechange', changed);
        changed();
      });
      activeWorker = worker;
      if (resourcesReady) warmAtlasResources();
    } catch { /* Private mode or storage limits leave normal network loading intact. */ }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1000);
}
