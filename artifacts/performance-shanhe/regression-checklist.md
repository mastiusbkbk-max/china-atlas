# PC regression audit

Status: browser verification completed for the 4203 candidate on 2026-10-27. Twelve assertions passed with zero uncaught browser exceptions. No performance figures are inferred from this audit. The GPU browser exited after verification.

Evidence: `regression-pc.json`, `regression-home-dpr1.png`, `regression-reading-dpr1.png`. The reading screenshot captures a close-up while surrounding tiles were still refining and is not evidence of final close-up completeness.

Verified: 81 source destinations, nine source region names, 84 landforms; 1.5 terrain exaggeration; 1496×900 and 2992×1800 backing canvases at DPR1/2; actual native label click; two article chapters and two photo buttons; full photo dialog; reset; nature classification; cross-category search; river toggle; landform selector; direct place link; selection made before native layer installation and retained afterward.

Limits: DPR2 native GPU screenshots stalled through CDP, so screenshots use DPR1 while DPR2 backing canvas/data assertions ran separately. The scripted pass did not test a physical mountain/river line click, full keyboard navigation or every destination. Ten unique native destination labels rendered in the initial view; this is distinct from the 81 source destinations. Region names appear less prominent than in the old DOM screenshot and warrant a collision/visibility check by the implementation owner. Existing unit tests cover place/landform event arbitration.

## Candidate checks

- Desktop viewport: 1496 × 900; record actual device pixel ratio and canvas backing size.
- Homepage: Chinese place names and mountain/river overlays render; inspect labels against fixed UI overlays.
- Data: 81 destinations, 9 region names and 84 mountain/river features remain available. Record visible rendered labels separately from source feature totals.
- Real map hit: click a visible place label and verify selected place, hash and detail panel agree; landform selection must not override the same click.
- Category: nature and culture filters; selecting a destination of another category through search restores all-category mode.
- Reset: selected marker and detail panel clear; overview returns.
- Landforms: river/mountain toggles, selector and actual line hit; selection is mutually exclusive with place selection.
- Reading: PC article scroll panel, cover photo, second image and full-size photo dialog. The expand-reading button is a mobile control and was excluded from PC verification.
- Deep link: direct location hash opens matching detail panel.
- Rendering: terrain exaggeration 1.5, antialias and native display pixel ratio retained; note runtime errors.

## Static findings to verify visually

- Native labels no longer use the prior DOM marker screen-safe region or 24-label cap. Collision placement can therefore differ, especially near fixed UI.
- Region names now have zoom bounds 3.3–8.5; they previously stayed present at all zoom levels.
- Canvas map labels do not retain individual DOM-button tab stops; search and catalog remain alternative keyboard paths.
- Existing unit tests validate feature data, filters and event arbitration with a fixture; they do not prove browser glyph rendering or label layout.
- MapLibre supports default local CJK glyph generation; absent remote glyph URLs alone do not establish missing Chinese text.
