import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import './map-engine.js';
import { registerAtlasWorker, warmAtlasResources } from './register-worker.js';

window.addEventListener('atlas:first-map', registerAtlasWorker, { once: true });
window.addEventListener('atlas:ready', warmAtlasResources, { once: true });

import './main.js';
