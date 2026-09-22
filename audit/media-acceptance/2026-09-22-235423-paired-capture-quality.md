# Paired article capture and quality upgrade — bounded implementation

Recorded: 2026-09-22 23:54:23 +08:00.
User intent: continue the Tampermonkey upgrade, capture TOC and main-text Figures/Schemes during a single article visit, and improve actual acquisition quality rather than only UI/version numbers.

## Scope and immutable evidence

Feature branch: fix/media-identity-v220; draft PR #129.
Tested functional head: 4746f9edb970995039e95dfa21a4da442b843733.
Workflow: Paired article capture workbench, run 35749982883, job 106821287727. Completed successfully at 2026-09-22T15:51:04Z.
Artifact ID: 10704384118; name tm-paired-source.
Downloaded artifact SHA256 independently verified in the conversation container: 015027cb067ef7f2df5db672387a8499c14e34f818e1f107114d5b6bff0ff79e.
The extracted head.txt equals the tested functional head above. The generated fixture screenshot was opened and visually inspected. It is a synthetic test page, not a publisher screenshot.

## Implemented on the upgrade branch

1. One DOI is one paired capture job. The article full-text URL is opened once and TOC and numbered Figure/Scheme/Chart candidates are collected from that DOM. Images are requested sequentially, not through multiple concurrent article jobs.
2. A TOC failure is handled independently, so main-text figures are still attempted. Both outcomes are retained; success, partial, failed and aborted are distinct. Published is explicitly false when only a staging receipt has been obtained.
3. A high-resolution candidate URL is no longer silently replaced by an image element's currentSrc. The actual request/final/canvas source URL is preserved. Up to four candidate variants per role/label are compared by measured dimensions or validated vector structure; the per-article in-memory cache reuses the same URL result.
4. SVG content is parsed in the browser; active/external content is rejected. Genuine vectors are not rejected solely because their displayed width is small. Mixed vector/raster SVG is separately labelled; raster-only wrappers must still meet raster thresholds. Ordinary low-resolution raster acceptance was not relaxed.
5. Figure labels and captions are scoped to the owning figure. Recommended/related areas and shared ancestors with conflicting numbered captions are excluded. Broad whole-page semantic windows no longer confer TOC status on an adjacent Scheme.
6. Main-text capture budget increased from five semantic images to up to twenty numbered images per article, subject to a six-minute capture deadline. Limit reached is a partial result, not proof that every image in the article was collected.
7. Controller receipts require current task nonce and runtime version. The capture result is saved before potentially slow report transport so diagnostic upload is not the sole acknowledgement channel. The current summary records TOC and staged figure counts separately.
8. The queue-builder source now emits a complete article registry, including media generation. The new controller refuses an old/incomplete feed and computes TOC need against the published media manifest; an already available official TOC does not suppress the body-figure job. The full new production queue has NOT been generated or published in this turn.

## Actual automated acceptance

MEDIA_IDENTITY_TEST_SUMMARY: passed=21, productionWrites=0.
DIRECT_STAGE_TEST_SUMMARY: passed=9, productionWrites=0.
PAIRED_CAPTURE_TEST_SUMMARY: passed=17, realBrowser=Chromium, externalPublisherAccess=false, productionWrites=0, fixturePosts=7.
Total assertions passed in this run: 47.

The real Chromium fixture exercised actual DOM selection, SVG image decoding, HTTP-shaped storage receipts and two same-article capture scenarios. One visit stored one TOC and two body figures; after removing the TOC from that same page, the two body figures were still staged and the task was partial rather than failed or falsely complete. Recommended other-paper images and an ambiguous shared Scheme container were excluded. A stale nonce was rejected. These are browser-fixture regressions, not real authenticated ACS/Wiley/Nature end-to-end acceptance.

## Release boundary and remaining work

Production userscript has not been replaced by this turn. This is still an unpublished 2.2.20/6.2.20 branch, not an install-ready fixed URL.
No production media assets, D1 records, R2 indexes, literature cards, quarantine epoch or previously restored TOC allowlist were modified. Main writes in this turn are audit records only.
Before installation release, rebase/review against current main, finish SVG-compatible verified stage-to-read/promotion handling (including immutable object/hash and actual D1 receipt checks), publish the complete queue, align packaging/version contracts, and verify the deployed userscript and endpoints. Current promotion still has separately known old-row duplicate/resolution and SVG-format inconsistencies; do not silently reopen the direct-import lockdown or unquarantine old media.
Real publisher authentication/redirect behavior is not yet validated. In particular, URL-fragment/sessionStorage tab binding must be challenged across cross-origin login redirects before claiming robust automatic resume. Do not claim all publisher layouts are covered by the synthetic fixture.
The paired attempt generation currently includes queue.generatedAt; make success tracking stable across mere queue refreshes before broad release so an unchanged older DOI is not re-captured on every regenerated feed. Per-figure partial resume beyond the twenty-figure budget is also not implemented yet.

## User action

No reinstall or new trial requested in this batch. Keep existing credentials and 2.2.19 configuration, with bulk capture paused. Do not provide a branch userscript as a supposedly live production update.
