# Owner-approved Tampermonkey A/B/C production handoff (2026-10-10)
北京时间：2026-10-10 14:43:48; repository: zhou526316-sys/organic-synthesis-gallery; main source of truth.

## Code review and changes
PR #465 merged: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/465
merge commit a44174c4c31ce07002565fe03e2203b8eb06d514. All 28/28 PR checks passed.
Bridge loader 2.2.80 / engine install 6.2.61 / capture protocol 6.2.20 / controller 2.2.41.

A: RSC Silverchair DOI+ArticleId official AJAX and article-bound SVG/object/figure candidates; reject PDF first-page preview/foreign DOI; no authorization bypass or fake assets. Owner's real 13-RSC-DOI capture results remain pending next authorized browser run.
B: ACS/RSC unusable official TOC -> genuine verified Figure 1 fallback; Chem login gate and private PDF 403 remain separate and non-bypassed.
C: owner evidence inventory uses authenticated 200-row cursor pages with completeness, duplicate identity, no unknown->missing conversion; publication receives only complete, DOI/hash/source/quality verified body figure packets; media blocker UI describes access, image and PDF failures distinctly.

## CI and deployment
Main GitHub Pages run #38030902456: success, including authenticated literature authorization, full media build, verified primary+body images, front-end/PDF checks, Pages deploy and source checks.
Worker deployment #38030902460: success.
Post-deploy real installer readback #38031192717 rerun (job 114153838848): success, checkedAt 2026-10-10T06:39:51.825Z (14:39:51 Beijing). Both https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js and https://api.gczhouwld.com/gallery-vpn-bridge.user.js returned HTTP200, Bridge 2.2.80, engine 6.2.61, correct October-1+ scope and owner PDF guarding, anonymous private PDF inventory access rejected. No private data exported.
Independent browser image publication verification #38031686964 success, NEW_BODY_AUTO_LIVE result=passed, files=1200, cards=21, pairedToc=21, browserRenderingVerified=true.

## Exact media gap reverified
DOI 10.1021/acs.orglett.6c03915:
- Before deployment: R2 stage had 9 reviewed-pending figures, final Tampermonkey report final=true / figuresDiscovered=9 / figuresStored=9, successful official TOC, PDF HTTP403. Public /api/article-figures: empty; old Gallery /media-index.json absent.
- After production deploy: https://gallery.gczhouwld.com/media-index.json generatedAt=1791614043096 includes the exact DOI and official TOC plus 9 figure labels Figure1, Figure2, Scheme1..Scheme7.
- https://gallery.gczhouwld.com/auto-body-publication.json generatedAt=1791613780812 contains 9 corresponding DOI records. The genuine byte/browser auto media release #38031686964 passed with 1200 listed assets.
- Dynamic https://api.gczhouwld.com/api/article-figures?doi=10.1021%2Facs.orglett.6c03915 remains available=false / zero. Cloudflare Worker /api/media/batch reads D1 and may also be empty; frontend's static manifest runtime-recovery exists, but dynamic API/static consistency needs separate frontend/backend repair. DO NOT claim dynamic API successful, and do not claim all users' cards rendered this exact DOI without a DOI-specific live browser test.
- Full corpus 19 remaining from prior owner log cannot be marked fixed until owner updates Tampermonkey and supplies new legitimate RSC/ACS/Chem session logs.

## Follow-up
A separate PDF-reader branch commit e9da63aadbe503406b0a751935ff3553aabd2b84 has queued a second, non-canceling Pages deployment #38031528813; do not interrupt, and verify it does not regress Bridge/media. No changes to the sole 08:00 Beijing literature admission slot.
Recommended owner action: update existing Tampermonkey in both Edge/Chrome through canonical Gallery installer; preserve keys/local cache; confirm 2.2.80/6.2.61 and run only missing obligations; upload new owner log; verify actual RSC success, Chem real permissions, and storage receipts. No claim of new publisher captures from test mocks.
