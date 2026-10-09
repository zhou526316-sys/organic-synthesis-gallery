# PDF reading feedback: continuous vertical scrolling

Date (Beijing): 2026-10-09T10:44:44.949+08:00
Feedback ID: PDF-UX-CONTINUOUS-SCROLL-2026-10-09
User original: “先说另外的问题：我希望我的PDF是上下滚动的，不要翻页的”
Status: **implemented, merged, deployed; user’s own authenticated/end-device acceptance still pending**. User approved standard normal PDF viewing by saying “就按照正常的pdf展示就行”; full code PR #428 merged 2026-10-09 11:15 Asia/Shanghai.
Code was developed on feature/pdf-continuous-scroll-20261009 and merged as PR #428. This document originally described the preapproval read-only baseline; the historical diagnostics below are kept for traceability.

## Original baseline before PR #428 (historical)

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

## Verified post-merge result (2026-10-09, Beijing)

- [PR #428](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/428), merged at 2026-10-09T03:15:17Z, merge SHA `bdacd9f3af84185a08046bde2b263da99166be7e`.
- Production GitHub Pages workflow [37878428923](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37878428923) completed success after the PR merge. Current main has `src/pdf-continuous-viewer.mjs`, `src/private-pdf-reader.mjs` imports it, and local `src/pdf-vault/reader.mjs` imports the same viewer.
- Public online `https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Facs.orglett.6c03725` was re-fetched without login and its rendered static page included `连续滚动`. This confirms the new public shell was deployed, not that this user’s private file transfer works end-to-end.
- Isolated [browser run 37877862110](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37877862110) all green: 33/33 online private PDF fixture regressions and 23 successful local PDF vault browser checks, including scroll across two actual fixture pages, page count tracking, closing clears pixels, 390px mobile-width viewport, authentication boundaries, first-page progressive Range loading. These are CI browser tests, not end-user mainland network validation or 100-page performance benchmarking.
- [Original figure rescue regression 37878013814](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37878013814) success, plus site quality gate and Cloudflare migration CI success on the feature commit `d3fcfeba0d85d71479fc38a2701d8919f7bc6911`.
- Visual design: continuous vertical page flow, mouse wheel/touchpad/mobile swipe, `X/Y` current page, zoom/download, original source Figure/Scheme navigation and crop tied to actual original-page canvas. Uses PDF.js continuous viewer off-screen rendering queue; no PDF data exposed or uploaded in this change.
- **Outstanding separate integration hazard:** [PR #420](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420) is still unmerged; its older `src/private-pdf-reader.mjs` does **not** import the continuous viewer and its `pdf/index.html` reflects the prior single-page UI. It must be reconciled with current main and re-regressed before any Tencent failover merge/deploy, or this new user-approved PDF scroll behavior may regress. Do not merge PR #420 as-is.
- Gallery owner-only network access work, Tencent DNS-only gateway and zero-new-charge infrastructure are separate; their live acceptance was not silently declared complete by the scrolling PR.

Status remains awaiting **user-side authenticated actual Edge/mobile interaction confirmation** for full experiential acceptance; do not mark feedback fully resolved solely from unauthenticated shell + CI fixtures.
