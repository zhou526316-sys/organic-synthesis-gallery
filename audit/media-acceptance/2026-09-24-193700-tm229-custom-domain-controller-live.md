# Bridge 2.2.29 — custom-domain Gallery controller live acceptance

Recorded 2026-09-24 19:37 Asia/Shanghai.

## User-observed failure

On the production Gallery custom domain, Tampermonkey showed “没有运行中的脚本” and only generic Tampermonkey menu items. All OSG menu commands were absent.

The installed local client was still Bridge 2.2.27.

## Root cause

The production Gallery had been cut over to:
- https://gallery.gczhouwld.com/

The old Bridge 2.2.27 metadata did not match that host, so Tampermonkey did not inject the script on the current Gallery page.

Bridge 2.2.28 packaging had begun adding the custom-domain @match through TARGET_SITE_ORIGIN, but the standalone/mainline controller still used:
- GALLERY_HOST = zhou526316-sys.github.io
- GALLERY_PATH = /organic-synthesis-gallery/
- isGalleryPage() recognizing only the legacy GitHub Pages project path and pages.dev mirror.

Therefore a full controller-host cutover was still required.

## Bridge 2.2.29 fix

PR #217 — “Bridge 2.2.29: run controller on gallery.gczhouwld.com” — merged as:
- 8e7837412bc3d81ad060e9f5bb966f636e716ec6

Changes:
- standalone @match explicitly includes https://gallery.gczhouwld.com/*;
- standalone update/download URLs now use gallery.gczhouwld.com;
- primary GALLERY_HOST becomes gallery.gczhouwld.com with path /;
- legacy zhou526316-sys.github.io/organic-synthesis-gallery/ remains recognized;
- organic-synthesis-gallery-public.pages.dev remains recognized;
- manual “立即运行媒体抓取队列” fallback opens the custom-domain Gallery;
- installer/controller version becomes 2.2.29;
- capture protocol remains 6.2.20.

Retained:
- Bridge 2.2.28 per-DOI skip-and-continue behavior;
- Bridge 2.2.27 publisher final-result precedence;
- DOI/source identity guards;
- image quality thresholds;
- TIFF/currentSrc behavior;
- staging/publication policy;
- literature data.

## Regression evidence

Latest PR head b92c534aefc4caa2b1040a7e5b0f086d50610a6f:
- 35993235422 — Bridge 2.2.29 custom-domain controller regression — success;
- 35993235428 — Bridge 2.2.29 skip per-DOI controller failures — success;
- 35993235336 — Tampermonkey window guard regression — success;
- 35993235374 — Tampermonkey live progress regression — success;
- 35993235392 — Cloudflare migration CI — success;
- 35993235242 — Gallery authors/site data — success;
- 35993235287 — Publisher TOC adapter CI — success;
- 35993235328 — Site quality gate — success.

The dedicated regression executes isGalleryPage() and proves:
- gallery.gczhouwld.com => true;
- legacy GitHub Pages project path => true;
- pages.dev mirror => true;
- publisher hosts => false.

The exact built installer regression also requires:
- @version 2.2.29;
- @match https://gallery.gczhouwld.com/*;
- @updateURL https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js;
- @downloadURL https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js;
- CONTROLLER_REVISION 2.2.29;
- GALLERY_HOST gallery.gczhouwld.com.

## Production deployment

GitHub Pages run 35993787734:
- literature_authorization: success;
- build: success;
- deploy: success.

Post-deploy live verification:
- 35993998546 — Verify Bridge 2.2.29 live — success;
- 35993998539 — Verify live progress installer — success.

Live artifact 10805506643 reported:
- ok: true;
- installerVersion: true;
- controller: true;
- protocol: true;
- fallback: true;
- tiff: true;
- ordering: true;
- resultPrecedence: true;
- guards: true;
- noEval: true;
- installerBytes: 179117;
- mainlineBytes: 134249.

No local 2.2.29 capture report is claimed yet. The user must first update the local Tampermonkey script and refresh the custom-domain Gallery.

## Required local action

Open:
https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js?v=2.2.29

Perform an in-place update. Do not uninstall the existing script and do not clear Tampermonkey storage/token/checkpoints.

Then refresh:
https://gallery.gczhouwld.com/

Expected result:
- Tampermonkey no longer says “没有运行中的脚本” on the Gallery page;
- OSG menu commands reappear;
- controller can start on the custom-domain page;
- per-DOI controller failures skip the DOI and continue instead of pausing the whole capture line.
