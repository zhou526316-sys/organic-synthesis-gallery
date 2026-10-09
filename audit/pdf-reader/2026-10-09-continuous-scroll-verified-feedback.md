# PDF reading feedback: continuous vertical scrolling

Date (Beijing): 2026-10-09T10:44:44.949+08:00
Feedback ID: PDF-UX-CONTINUOUS-SCROLL-2026-10-09
User original: “先说另外的问题：我希望我的PDF是上下滚动的，不要翻页的”
Status: verified as UX preference and current implementation; **awaiting explicit user approval** under PROJECT_RULES.md feedback approval gate.
No repair branches, production code/data, or deployment changes performed for this feedback.

## Read-only evidence from current main

1. `pdf/index.html`: toolbar buttons `#previous` (“上一页”), `#next` (“下一页”), `#page-count`, zoom/download; reading area `#stage` contains exactly one `#pdf-canvas`, inside `#pdf-page-wrap`.
2. `src/private-pdf-reader.mjs`: `pageNumber` mutable state, `render()` calls `pdf.getPage(pageNumber)` and repaints single canvas, click handlers change pageNumber. Also integrates image extraction and `#pdf-crop-box` relative to one PDF canvas, `#pdf-figure-rescue` page jumping; these must not break.
3. `pdf-vault/index.html`: modal reader has explicit `pdf-vault-reader-previous`/`-next`, single canvas.
4. `src/pdf-vault/reader.mjs`: `renderPage()` invokes pdf.getPage(pageNumber), then `stage.scrollTop=0`; user must click page buttons. Account isolation, local-only file privacy and export flow must remain intact.

## Proposed change, pending approval

- Online owner private PDF and local PDF-vault modal both default to native vertical scroll through continuous document pages; mouse wheel, touch swipe, trackpad scroll cross pages without button presses. Toolbar retains current/total page indicator, zoom, download/export; remove previous/next as primary controls.
- Virtualize and lazy render visible + adjacent page canvases; stable placeholders preserve scroll height; unload distant raster canvases while preserving PDF.js document and reader Range requests. Prioritize first page/visible page, avoid pre-rendering all pages, long PDF memory spikes, and forced full-file download.
- Maintain per-page annotations rendered as non-interactive raster per current policy, authenticated Range transport and PDF header validation, error handling and read permissions. Current page index tracks scroll position.
- Preserve existing online "from PDF find figure" and original-figure crop region tools by mapping extraction/selection to the exact chosen page/canvas; no redrawing chemical structures and no accidental upload of PDF originals.
- Verify 2/10/100+ page PDFs, desktop and mobile swipe, scrolling through pages, zoom retaining location, page current count, local OPFS/directory access, crop rescue, 401/403/429 and baseline gateway transport; check memory and scroll responsiveness.
- No coupling with PR #420 Tencent PDF gateway, no paid service and no current 08:00 formal literature publish changes.

Decision requested from user: approve both online and local continuous-scroll default and removal of previous/next as primary controls; if approval is granted, implement in a separate bounded change and perform regression before production deployment.
