# Final cards candidate PC regression

Candidate: `http://127.0.0.1:4210/china-atlas/`. Completed 2026-10-27 with 19 passing assertions and zero uncaught runtime exceptions. The GPU browser exited after the run; the benchmark owner was notified to start the final measurements.

The progressive carousel initially contains five cards. A test injected at `atlas-shell` focused the first card and immediately requested the next group. Completion appended all 81 destinations, retained the original first DOM node and its keyboard focus, and scrolled the carousel by 569 px. Another early test switched nature → culture before the delayed completion; the final carousel contained exactly the 37 culture destinations, in order and without duplicates.

Both DPR1 and DPR2 rendered all nine region names in the map canvas. The 1496×900 viewport retained native 1496×900 / 2992×1800 backing canvases, 1.5 terrain exaggeration, 81 destination source features and 84 landform features. The last card, 麦积山石窟, rendered its real text and decoded thumbnail after horizontal scrolling; a real Tab event from card 80 focused and revealed card 81.

Actual native-label selection, two article chapters and photo metadata, full photo dialog, category/search transitions, reset, river toggle, landform selection, direct location hash and pre-native-layer selection all passed. Homepage screenshot review found no new visual regression.

The JPEG protocol is unchanged from the images candidate, so its six-sample byte and full-RGBA identity verification is reused from `regression-images-pc.json` instead of repeated. Screenshots use DPR1 because the headless GPU DPR2 screenshot command previously stalled; DPR2 backing canvas, region-label and feature-data assertions passed separately.

Evidence: `regression-cards-pc.json`, `regression-cards-home-dpr1.png`, `regression-cards-last-card-dpr1.png`. This audit does not establish performance timings or validate all destinations individually.
