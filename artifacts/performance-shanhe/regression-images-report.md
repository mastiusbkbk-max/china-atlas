# Images candidate PC regression

Candidate: `http://127.0.0.1:4209/china-atlas/`, reference: port 4207. Completed 2026-10-27 with 17 passing assertions and zero uncaught runtime exceptions. The GPU browser exited after the run.

- Six fixed satellite/relief JPEGs, across zoom levels 0–9, have identical SHA-256 bytes on both candidates. Each was decoded using the former Blob → createImageBitmap path and the new stable-URL HTMLImageElement path. All 393,216 pixels (1,572,864 RGBA channels) matched exactly, with maximum channel difference zero.
- Both DPR1 and DPR2 rendered all nine region labels in the map canvas after the collision fix. The initial view rendered 11 unique place labels; the source still contains all 81 destinations.
- The 1496×900 viewport uses 1496×900 and 2992×1800 canvas backings at DPR1/2. Terrain exaggeration remains 1.5; 84 landform features remain available.
- All 81 destination cards remain in the carousel. Scrolling to the end reveals the last destination, 麦积山石窟, with real text layout and a decoded 480×288 thumbnail. A real Tab event from card 80 focuses card 81 and scrolls it into view.
- Actual native place click, article and two-photo metadata, photo dialog, category filters, cross-category search, reset, river visibility, landform selection, direct location hash and selection before native-layer installation all passed.

Evidence: `regression-images-pc.json`, `regression-images-home-dpr1.png`, `regression-images-last-card-dpr1.png`. The DPR2 backing canvas and data were tested; screenshots use DPR1 because a prior headless GPU DPR2 screenshot request stalled. This is a functional and pixel-preservation audit, not a performance measurement.
