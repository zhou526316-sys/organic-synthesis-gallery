# Media delivery integrity repair — 2026-10-04

User approval: 将问题解决，但不要触发到其他核心规则。不能影响整体使用。
Baseline main c8464f8acf9bfaf6265cdfabdc0fcbf1509dcf72; diagnosis audit/media-diagnostics/2026-10-04-acquisition-versus-publication.md.

This first repair is limited to stored-media delivery. It does not change the installed collector, public UI, DOI/scope registry, literature dataset, literature slots, summary jobs, media generation, authentication, quality thresholds, same-build official TOC requirement, completed-packet requirement, maxFiguresPerCard, snapshot publication caps or automatic media schedule.

## Confirmed defects and scoped changes

1. Both build-pages-mirror.mjs and merge-worker-media.mjs omitted image/svg+xml and .svg from extensionFor and defaulted to jpg. Therefore valid SVG bytes were written as .jpg and rejected by the unchanged sanitize-static-media.mjs byte/extension check. Added SVG type/extension mapping only. Test reproduces rejection of identical bytes as old.jpg and survival as fixed.svg; the sanitizer is not loosened or modified.
2. The publication reader required stage.count===items.length and count<=2000 while the default Worker list capped items at2000. New optional publication=1 mode returns full evidence-bearing rows in250-item snapshot-bound pages. Page schema, SHA256 snapshot, generation, offset, count, nextOffset and unique DOI/image identities are validated. A changing snapshot yields409 and bounded whole-snapshot retries. The existing default list and inventory=1 contracts remain unchanged. Raw image bytes, fulltext, credentials and trace contents are not added to these metadata responses.
3. Complete final-success body packets are read across all retained DOI records rather than only the latest200 reports. A compact completedFigurePacket is retained alongside the existing per-DOI diagnostic history, so later TOC-only or failed reports cannot erase a previously valid completion. A partial/nonfinal/old-generation/foreign-DOI report is not promoted to success. All existing per-image hash/source/marker/decoder checks and same-build TOC/atomic publication gates still run. Metadata receipt retention is not publication approval.
4. The polling command now reports input_error with null candidate totals and exits nonzero on input failure; it does not mislabel unavailable input as zero waiting. Normal site builds retain their existing fail-soft no-new-media behavior and prior-image retention.

## Verification

Local17 new tests pass. Actions run37173217110 succeeds after correcting only the new test workflow's npm installation command (Worker directory has no package-lock). First run37173159767 passed every test and protected-file check but stopped before any source commit at that setup mismatch.

Passing suites:17 new delivery tests;11 existing atomic packet publication tests;11 release/checkpoint tests;12 upload tests;18 full-queue tests;29 missing-only tests; report-history and private evidence/provenance suites. Worker Wrangler dry-run passes. No production media writes or publisher requests in these tests. Exact artifact11292521113 source bytes for all six runtime/helper files were downloaded and matched locally tested bytes.

Before/after SHA256 checks pass unchanged for PROJECT_RULES.md, AGENTS.md, shared/literature-journals.js, audit/media-auto-policy.json, scope/update contracts, literature-audit.yml, github-pages.yml, new-body-continuous.yml and public/toc-mainline.user.js. Existing scheduled workflows have not been edited. The new regression workflow commits only four named ordinary source files to its own repair branch.

## Remaining acceptance

PR/main tests, actual Worker publication pages, canonical TOC assets, body-publication ledger and browser/site functionality must be verified after normal deployment. Historical CI failures must not be relabelled green. This change does not itself repair or prove user-browser access to ACS403 assets or Angew body DOM. Those acquisition issues remain a separate scoped investigation; no fabricated capture recovery or whole-site guarantee is claimed.
