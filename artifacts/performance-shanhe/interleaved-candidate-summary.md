# Frozen candidate, interleaved comparison

All times below are navigation-relative milliseconds, medians of five measured samples, excluding warmup. This is a local-loopback GPU benchmark, not a GitHub Pages network guarantee.

| Variant | DPR | Cache | Samples | Satellite ready / controllable | Full terrain, 84 landforms, 81 places + 9 geography labels |
|---|---:|---|---:|---:|---:|
| original | 1 | cold | 5 | 113.2 | 338.9 |
| original | 1 | warm-reload | 5 | 98.5 | 292.6 |
| original | 2 | cold | 5 | 112.0 | 328.3 |
| original | 2 | warm-reload | 5 | 99.8 | 290.9 |
| published | 1 | cold | 5 | 133.8 | 307.9 |
| published | 1 | warm-reload | 5 | 125.3 | 285.9 |
| published | 2 | cold | 5 | 115.8 | 328.9 |
| published | 2 | warm-reload | 5 | 121.2 | 314.7 |
| candidate | 1 | cold | 5 | 97.9 | 327.6 |
| candidate | 1 | warm-reload | 5 | 95.1 | 309.8 |
| candidate | 2 | cold | 5 | 107.0 | 333.8 |
| candidate | 2 | warm-reload | 5 | 102.3 | 312.7 |

## Findings

- DPR 1 cold: candidate first map 26.8% faster than published; 13.5% faster than original. Full content -6.4% faster than published and 3.3% faster than original (negative = slower).
- DPR 1 warm-reload: candidate first map 24.1% faster than published; 3.5% faster than original. Full content -8.4% faster than published and -5.9% faster than original (negative = slower).
- DPR 2 cold: candidate first map 7.6% faster than published; 4.5% faster than original. Full content -1.5% faster than published and -1.7% faster than original (negative = slower).
- DPR 2 warm-reload: candidate first map 15.6% faster than published; -2.5% faster than original. Full content 0.6% faster than published and -7.5% faster than original (negative = slower).

The first-map startup regression is substantially recovered. Candidate warm reload remains above the 80 ms target, and complete-content readiness is not consistently improved. These data do not substantiate a blanket 20% improvement or completion of the performance targets.

## Validity checks

- 60 measured navigation samples, 6 warmup samples; three frozen versions in one Chromium session. Alternating order, each cold sample immediately followed by genuine reload.
- Cold clears HTTP cache and relevant origin storage; separate ports isolate origin storage. GPU, shader, OS caches are shared and not cleared.
- 1496×900 viewport, native DPR 1 (1496×900 canvas) and DPR 2 (2992×1800 canvas). Hardware Apple M5 via Metal / WebGL 2; no screenshot capture during measurements.
- Map ready requires actual satellite textures, source completion, input controls enabled, and two animation frames after a render. Actual pointer drag accepted in every measured sample.
- Full ready separately requires loaded terrain, all 84 landforms, 81 place labels, 9 geography labels, no camera movement, loaded tiles, and two frames. All candidate samples satisfied completeness.
- Runtime exceptions: 0; instrumentation exceptions: 0; candidate map errors: 0.
- No network/CPU throttling; all non-local requests blocked to isolate product startup. This does not measure remote imagery/photogrammetry timing, actual displays, or physical interaction-to-photon latency.

Raw results: interleaved-candidate.json. Test driver: interleaved.mjs and probe-interleaved.js.
