# Static import screening

Three interleaved cold/warm pairs per version per DPR. All values are median milliseconds.

| Version | DPR | Cache | First complete satellite | Full terrain/geography/labels |
|---|---:|---|---:|---:|
| final | 1 | cold | 95.3 | 294.6 |
| final | 1 | warm-reload | 87.1 | 267.3 |
| final | 2 | cold | 97.5 | 291.8 |
| final | 2 | warm-reload | 93.5 | 276.6 |
| static | 1 | cold | 96.5 | 292.7 |
| static | 1 | warm-reload | 86.8 | 277.0 |
| static | 2 | cold | 100.0 | 314.9 |
| static | 2 | warm-reload | 97.6 | 312.7 |

No consistent startup improvement; high-DPR full readiness is slower. Keep the existing final import strategy. Both versions render all nine region names, preserve native DPR and data counts, and all actual clicks provide feedback under 24 ms. Ordinary map render callback throughput exceeds 120 fps in one two-second sample per group (not physical display FPS).

Product Runtime exceptions: zero. One instrument Fetch InvalidInterceptionId when a detail image request was cancelled during navigation; recorded in raw evidence and not excluded from timing samples.

Raw evidence: interleaved-static-screen.json. Same startup, full-ready, cache, GPU and server conditions as previous comparisons.
