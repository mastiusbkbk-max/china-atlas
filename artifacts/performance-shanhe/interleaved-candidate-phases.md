# Candidate startup phase diagnostics

Same 60-sample interleaved run as interleaved-candidate.json. All values are medians of each individual metric (therefore the component medians do not necessarily sum to the median total). Milliseconds from navigation start, except duration columns.

| Variant | DPR | Cache | API assigned | First textured raster | Source-complete render | 2-rAF presentation bound | API→raster | Raster→source complete | Complete→2-rAF |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| original | 1 | cold | 39.5 | 67.8 | 96.8 | 113.2 | 28.9 | 27.0 | 15.8 |
| original | 1 | warm-reload | 27.4 | 62.7 | 81.8 | 98.5 | 32.9 | 22.1 | 16.0 |
| original | 2 | cold | 39.4 | 73.1 | 96.3 | 112.0 | 32.4 | 23.2 | 15.7 |
| original | 2 | warm-reload | 36.1 | 68.9 | 83.4 | 99.8 | 31.3 | 14.2 | 16.4 |
| published | 1 | cold | 41.6 | 58.5 | 116.3 | 133.8 | 18.2 | 58.7 | 19.8 |
| published | 1 | warm-reload | 32.1 | 61.1 | 107.3 | 125.3 | 27.3 | 52.8 | 16.9 |
| published | 2 | cold | 42.7 | 67.4 | 109.4 | 115.8 | 24.7 | 41.7 | 9.0 |
| published | 2 | warm-reload | 32.5 | 61.5 | 111.1 | 121.2 | 31.5 | 53.2 | 10.1 |
| candidate | 1 | cold | 35.3 | 58.5 | 82.1 | 97.9 | 21.5 | 23.6 | 15.8 |
| candidate | 1 | warm-reload | 30.8 | 55.5 | 79.2 | 95.1 | 24.5 | 23.6 | 15.9 |
| candidate | 2 | cold | 39.5 | 67.6 | 91.1 | 107.0 | 27.8 | 23.5 | 15.9 |
| candidate | 2 | warm-reload | 31.7 | 63.2 | 85.5 | 102.3 | 28.5 | 22.3 | 16.0 |

Published regression is concentrated between first raster and satellite source completion: 41.7–58.7 ms versus original 14.2–27.0 ms. The candidate reduces that phase to 22.3–23.6 ms. The combined candidate reaches API creation only 0.8–6.3 ms earlier than published in these local warm/fast-network conditions; the contribution of boot alone is not isolated. Boot-only ablation is worthwhile to separate its effects from deferred label/terrain scheduling, especially for remote network; it is lower priority than the remaining 15–22 ms required for the warm ≤80 ms target.

Candidate's warm complete→2-rAF bound is 15.9–16.0 ms. This is deliberately conservative presentation instrumentation and should not be removed to cosmetically meet the target. Warm API→raster still costs 24.5–28.5 ms, then raster→source completion another 22.3–23.6 ms. Their subphases are the remaining startup work to investigate.

All 20 candidate samples contain no main-thread >50 ms long tasks. This does not exclude repeated smaller startup jobs or Worker/GPU bottlenecks.

One DPR2 warm sample shows imagery enhancement at 102 ms but initial terrain fetches at 197.7 ms (old builds begin near 193–195 ms); after that, many terrain LODs 1–5 load. Hypothesis to validate: scheduling all native GeoJSON/symbol work before terrain in enhanceMap may delay terrain updates/requests. Setting terrain before labels or prefetching initial DEM after satellite completion may improve full content without competing with first satellite load. This is a hypothesis, not an established cause.
