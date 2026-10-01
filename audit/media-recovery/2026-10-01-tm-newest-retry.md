# Tampermonkey newest/retry repair — 2026-10-01

Context: user explicitly requested “为什么没有优先抓取今天新增的？而且有好多失败的，请解决。” Scope is acquisition only. Main baseline f65870f3c07a60b2459d8ff53dbd7b8bf788123e. Preserve Bridge/controller 2.2.39, capture protocol 6.2.20, media generation 1790082000000, credentials/checkpoints, production corpus, literature slots and publication authorization.

## Read-only evidence

Diagnostic workflow run 36814327850, read 2026-10-01T04:16:32.741Z (Beijing 12:16:32). Source artifact 11140123209. Live queue generated 2026-10-01T00:01:53.027Z: 726 corpus DOIs, latestAddedDate 2026-10-01, latestAddedCount 16. Static figureGap counts are not deployed figure inventory and must not be reported as all papers missing figures.

Latest local-diagnostics batch snapshot: total target 20; ten completed results, success 2, partial 2, failed 6, TOC receipts 4, figure staging receipts 19. This is not a final 20-paper outcome and not an overall failure rate. All six failed completions were CCS papers with bound_publisher_heartbeat_missing: 10.31635/ccschem.026.202507094, 10.31635/ccschem.026.202507282, 10.31635/ccschem.026.202607330, 10.31635/ccschem.026.202607499, 10.31635/ccschem.026.202607611, 10.31635/ccschem.026.202607682.

The userscript omitted www.chinesechemsoc.org/apex matches, while CCS Chemistry's publisher site is https://www.chinesechemsoc.org/journal/ccschem. Its articleUrl fell through to doi.org. Worker CORS and fulltext publisher-source allowlists also omitted that exact domain. Fix all three layers, preserve DOI binding, and do not allow look-alike or arbitrary third-party origins. This source/trace diagnosis is not a successful post-fix authenticated publisher capture.

ACS trace samples include HTML responses from /view-large/figure/...svg (viewer pages, not image bytes), HTTP503 HTML at upload with no structured Worker error code, and nested gm_then_fetch_failed chains. Do not infer an R2 quota/storage cause from an HTML503, or count intermediate candidate failures as failed articles. Existing same-figure CDN/DOM candidates and positive staging receipts are retained.

## Reproduced code defects and bounded fixes

1. captureQueueTier previously put latest already-TOC-covered figures/evidence behind every historical TOC. The whole latest addedDate cohort now takes priority; journals rank within a tier. The actual existing paired retry gate has 30–180 minute waits plus six/twelve-hour cases; the older legacy isFailureCooling also has a six-hour default.
2. A batch kept its old registry until all selected articles finished; idle discovery was thirty minutes. Check the registry at safe between-article boundaries at most once per minute; finish and preserve the current result, then replan when DOI membership/addedDate/date/journal changes. Ignore pure reorder/generatedAt refreshes. Invalid/unreadable refreshed registry holds stale dispatch rather than resurrecting removed papers. Idle checks every minute; active ownership/leases unchanged.
3. Transient transport/heartbeat failures use bounded 5/15/30/60 minute backoff. Honor stored Retry-After; preserve provenance and access/rate-limit protections. The exact pre-fix CCS missing-heartbeat state gets one prompt retry after the host fix, without deleting state.
4. Skip the known ACS HTML viewer as a direct image route, retaining other same-figure sources. Avoid duplicating a native fallback already attempted by gmRequest. Allow one native request with identical bytes to the SAME owned API endpoint only for 502/503/504 HTML without Retry-After. No routing around 401/403/429, explicit extension denial, structured Worker errors or DOI checks.

## Verification before merge

Workflow run 36815169940 succeeded. Artifact 11139954593 contains the tested source, compatible installer and test output. New regressions: 30 passed. Existing upload: 12 passed; release/checkpoint/identity suite: 11 passed; automatic diagnostic delivery: 16 passed. Private fulltext provenance suite and diagnostic history suite also passed. No production writes or publisher downloads by these tests. Syntax and installer validation passed. Generated installer SHA256: 1dfdbf3d6e3540b0dca1f01beb34b6fdda8b06a8301bd6c2e7bc8e9ba47f5721.

Remote generated source bytes were compared with locally tested bytes and matched for all three changed source files. Historical branch-specific tests test-tm227-result-precedence and test-tm228-skip-controller-failures fail identically on the original baseline and patched source (stale 2.2.35 version assertion and an old stop-vs-skip expectation); no assertions were weakened to force those obsolete tests green.

Deployment and user-desktop acceptance remain separate: the self-contained same-version script already installed in a browser does not acquire modified embedded source merely because the server deployed it. Do not claim the desktop has switched or every previously failed paper has now succeeded without a fresh matching receipt.
