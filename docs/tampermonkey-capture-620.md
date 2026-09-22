# Bridge 2.2.20 / capture core 6.2.20

This media-only release preserves the 2026-09-22 21:00 Beijing quarantine and the 83 reviewed TOCs restored by #130. It does not restore unverified old media by timestamp manipulation.

## Capture behavior

- The current published corpus is represented once per DOI in queue version 3. The browser independently skips an official TOC already in the published media index, and continues collecting missing Figures/Schemes.
- TOC and article figures are collected on the same publisher visit when both are needed. Lazy body images are sampled across seven scroll positions. Up to 20 newly accepted images are stored per visit, with per-label receipts retained for continuation.
- Actual image bytes, not CSS display width, determine raster dimensions. Larger observed source candidates are tried; the selected URL is no longer silently replaced by the DOM thumbnail currentSrc.
- SVG with vector paths is distinguished from a small raster. Mixed vector/raster images remain labelled as mixed. Passive SVG validation rejects executable/external content before indexing.
- The browser sends media directly to the authenticated local-capture or figure-stage intake, not to the intentionally locked direct-import endpoints. Safe new browser media is internally indexed into D1. The reply says indexed=true only after reading back the matching stored digest.
- A stored/staged receipt is not the same thing as a published or rendered card. Stored body images not yet indexed remain available for controlled promotion; old unbound stages are not promoted. New live body entries are merged with the static figure collection instead of being hidden by an older static Figure 1.
- Task nonce, publisher-tab binding, page citation DOI and observed source DOI are checked. 6.2.19 clients may still upload diagnostics, but cannot submit new accepted media after the backend upgrade.
- Summary runtimeVersion is independent from historical summary.version. Current per-label receipts are version scoped. Users should retain their existing key/configuration rather than wiping Tampermonkey storage.

## Starting the released build

After both the public userscript and Worker capability endpoint verify 2.2.20/6.2.20, update the fixed gallery-vpn-bridge.user.js install URL. Close previous publisher job tabs and refresh one Gallery controller page. Select the existing Continue media capture menu action once; retain VPN/access session. Publisher login/captcha must be completed by the user. Do not run an old 2.2.19 controller concurrently.

## Evidence and limits

Assembly/packaging workbench 35752663205 and final cleanup workbench 35753575639 succeeded. The actual assembled worker code passed isolated R2/D1 tests, and the self-contained installer was built. The initial workbench 35752346319 reports 21 identity checks, 9 staging-receipt checks, 13 Worker SVG/indexing checks and 15 Chromium fixture checks. Six live/static union assertions are part of the permanent capture regression CI.

Fixture tests have no production media writes or authenticated publisher requests. Passing them is not evidence of a successful full real-publisher/user-VPN batch. The first deployed user batch must still be evaluated by actual DOI/page/source traces and stored/indexed counts; no claim of universal publisher success is made.

The validated build-stage queue contained 512 published DOI and 422 official-TOC gaps, after retaining 90 official TOCs. These are snapshot values; the deployed queue and actual publisher availability are authoritative at execution time.
