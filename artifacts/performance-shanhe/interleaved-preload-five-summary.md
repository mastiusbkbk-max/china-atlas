# Five frozen variants: formal interleaved comparison

Five samples for each variant/DPR/cache condition (100 measured samples plus ten warmups), alternating variant order and cold/warm pairs. All timings in ms.

| Version | DPR | Cache | Median first complete interactive satellite | Range | Median full terrain/geography/labels |
|---|---:|---|---:|---|---:|
| original | 1 | cold | 100.7 | 99.8–115.9 | 317.3 |
| original | 1 | warm-reload | 89.2 | 85.4–93.5 | 306.0 |
| original | 2 | cold | 116.7 | 105.9–121.2 | 354.9 |
| original | 2 | warm-reload | 108.0 | 98.9–120.5 | 339.2 |
| published | 1 | cold | 162.2 | 115.9–166.8 | 337.1 |
| published | 1 | warm-reload | 107.3 | 104.7–138.2 | 282.5 |
| published | 2 | cold | 189.9 | 134.9–198.8 | 390.9 |
| published | 2 | warm-reload | 129.7 | 118.2–296.2 | 351.2 |
| candidate | 1 | cold | 98.5 | 91.6–130.6 | 324.0 |
| candidate | 1 | warm-reload | 92.3 | 86.7–94.6 | 285.7 |
| candidate | 2 | cold | 110.2 | 107.0–253.9 | 366.3 |
| candidate | 2 | warm-reload | 103.5 | 98.2–140.4 | 327.4 |
| parallel | 1 | cold | 94.7 | 88.7–110.0 | 302.8 |
| parallel | 1 | warm-reload | 91.2 | 82.5–99.7 | 298.9 |
| parallel | 2 | cold | 104.8 | 99.6–260.8 | 364.5 |
| parallel | 2 | warm-reload | 98.0 | 95.8–109.4 | 324.4 |
| preload | 1 | cold | 98.5 | 88.3–118.3 | 343.9 |
| preload | 1 | warm-reload | 95.7 | 85.9–154.3 | 284.7 |
| preload | 2 | cold | 115.0 | 91.4–142.1 | 350.5 |
| preload | 2 | warm-reload | 96.0 | 92.5–116.4 | 321.2 |

- All navigation pairs use real reload; cold clears HTTP cache and origin storage. Same static handler, 1496×900 viewport, native DPR1/DPR2, Apple M5 Metal WebGL. GPU/shader/OS caches are shared. Remote browser requests blocked; no network or CPU throttling.
- First map criterion remains actual rendered textures and full satellite source, input enabled, followed by two rAF. Full readiness additionally requires terrain, 84 landforms, 81 places, and 9 geography names with source loaded. Each sample passes actual pointer drag.
- Runtime exceptions: 0; instrumentation exceptions: 0. All measured label data counts verified. Label counts do not imply every colliding label is visually shown.
- The parallel-image candidate is modestly faster than the combined candidate (1.2–5.3% median first map improvement), but this is not the requested 20% improvement versus original. Warm medians remain 91.2/98.0 ms, above 80 ms target.
- The HTML modulepreload variant has no consistent advantage: slower median first map at DPR1 cold/warm and DPR2 cold, slightly faster DPR2 warm. Do not select it based on the isolated best sample.
- Full readiness is not uniformly improved: parallel DPR2 cold 364.5 ms versus original 354.9 ms (+2.7%).
- This is localhost startup and GPU evidence; it does not establish public-network loading guarantees, high-fidelity remote scene timing, physical screen frame rates, or physical input latency. Some measured outliers are substantial and are retained, not discarded.

Raw evidence: interleaved-preload-five.json.
