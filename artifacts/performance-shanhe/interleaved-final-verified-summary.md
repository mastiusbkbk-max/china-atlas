# Final frozen candidate, formal comparison (not approved for release)

Five interleaved cold/warm pairs for original, published, final at DPR1/DPR2: 60 measured navigation samples plus six separate warmups. Apple M5 Metal WebGL, 1496×900 viewport, canvas 1496×900 / 2992×1800. All times are navigation-relative ms except click latency.

| Version | DPR | Cache | Median first map | Range | Median full terrain/geography/labels |
|---|---:|---|---:|---|---:|
| original | 1 | cold | 104.5 | 99.2–121.5 | 302.4 |
| original | 1 | warm-reload | 94.5 | 90.9–100.1 | 286.6 |
| original | 2 | cold | 110.6 | 99.8–115.0 | 316.7 |
| original | 2 | warm-reload | 99.1 | 97.3–111.5 | 282.6 |
| published | 1 | cold | 137.8 | 115.2–156.3 | 309.4 |
| published | 1 | warm-reload | 109.6 | 97.3–147.1 | 277.3 |
| published | 2 | cold | 116.3 | 115.4–170.6 | 329.6 |
| published | 2 | warm-reload | 122.7 | 108.8–154.5 | 290.3 |
| final | 1 | cold | 98.0 | 93.0–103.0 | 298.3 |
| final | 1 | warm-reload | 85.5 | 82.4–92.3 | 286.4 |
| final | 2 | cold | 102.3 | 92.5–112.0 | 308.1 |
| final | 2 | warm-reload | 106.8 | 90.9–171.9 | 318.9 |

The final candidate improves first map versus the published build by 12.0–28.9% across these four conditions. It does **not** consistently improve versus the original: DPR2 warm map median 106.8 ms versus 99.1 ms (+7.8%), full readiness 318.9 versus 282.6 (+12.8%). DPR1 warm 85.5 ms and DPR2 warm 106.8 ms are both above 80 ms target. The DPR2 final warm samples are 90.9,93.1,107.4,171.9,106.8; all retained. These results do not support a blanket 20% improvement or achievement of every target.

| Version | DPR | Click samples | Median feedback ms | Maximum ms |
|---|---:|---:|---:|---:|
| original | 1 | 5 | 16.7 | 18.4 |
| original | 2 | 5 | 17.6 | 18.6 |
| published | 1 | 5 | 16.0 | 18.5 |
| published | 2 | 5 | 15.4 | 19.6 |
| final | 1 | 5 | 16.2 | 20.9 |
| final | 2 | 5 | 17.0 | 17.7 |

Each click is an actual CDP mouse click on the Everest search result. Feedback includes panel DOM mutation and two-rAF presentation bound; it does not mean camera flight or full imagery/detail finished. All final clicks are under 40 ms.

Ordinary map simultaneous 25-degree rotation and zoom+0.2 over 2 seconds, after complete home load: final render callbacks 126.1fps at DPR1 and 124.5fps at DPR2. One sample per group, headless throughput, not physical screen guarantees. Complex real-scene FPS is not measured here.

All final samples preserve 81 place labels, 84 landforms, terrain exaggeration 1.5, 27 textured initial satellite tiles. All 9 region labels actually render in final; published only renders 2 due collision. All pointer drags accepted, all browser and instrumentation errors zero.

Each cold clears HTTP cache and origin storage, warm uses genuine Page.reload and verifies navigation.type=reload / pageshow.persisted=false. Same local static handler on isolated origin ports; GPU/shader/OS caches are shared, not cleared. All nonlocal browser requests blocked; no network or CPU throttling. This is not a GitHub Pages network or remote model guarantee.

Raw evidence: interleaved-final-verified.json. Frozen probe: interleaved-final-verified-probe.js.
