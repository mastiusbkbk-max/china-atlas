# Synchronous redraw screening

Frozen parallel and redraw variants, 3 interleaved cold/warm pairs per DPR1 and DPR2. Same GPU/browser/server/cache conditions as previous comparisons.

| Variant | DPR | Cache | Median map ms | Median full ms |
|---|---:|---|---:|---:|
| parallel | 1 | cold | 91.1 | 274.2 |
| parallel | 1 | warm-reload | 87.6 | 275.0 |
| parallel | 2 | cold | 98.3 | 294.0 |
| parallel | 2 | warm-reload | 90.4 | 266.4 |
| redraw | 1 | cold | 96.0 | 303.0 |
| redraw | 1 | warm-reload | 91.4 | 277.9 |
| redraw | 2 | cold | 103.9 | 303.7 |
| redraw | 2 | warm-reload | 101.2 | 318.0 |

The one-line synchronous redraw candidate does not improve any startup group. Keep the simpler parallel candidate. All 24 measured samples have 81+9 labels and 84 landforms in source data and loaded terrain, but only two region labels are actually rendered (海南岛 and 南海); symbol collision hides seven names. This is a visual regression compared with the original DOM labels and needs correction.

Real CDP clicks to the Everest search result produce DOM+two-rAF feedback in 12.3–20.1 ms; all 12 measured clicks are below 40 ms. This is feedback, not completed camera flight or image/terrain detail.

Two-second simultaneous rotation and zoom (25 degrees, zoom+0.2), after home full readiness and movement ended: parallel render callbacks 124.5 fps DPR1 / 122.2 fps DPR2; redraw 125.0 / 121.7. These are one sample per group and headless render callback throughput, not physical display guarantees. The first map, imagery dimensions, antialiasing and terrain resolution are unchanged.

Runtime and instrumentation errors: zero. Raw evidence: interleaved-redraw-screen.json.
