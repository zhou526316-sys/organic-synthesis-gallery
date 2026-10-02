# Full capture queue coverage v6 — 2026-10-03

User request: screenshot of 缺项补抓4 at40/40, followed by 为什么只是40篇？我要从头到尾、. Continue the user-authorized missing-only immediate-start workflow. No fixed article batch, latest website-addedDate first, then Nature/Science/Nature subjournals/Science subjournals/JACS/Angew/Chem/other. Preserve controller2.2.39, protocol6.2.20, generation1790082000000, credentials, positive stored objects and DOI/receipt/publication safeguards.

Baseline main6dd77885530c6e0fa3ef9afa67c0e1ec462a92c5. The previous undeployed continuous-v5 patch is not included in this change. Runtime marker QUEUE_COVERAGE_REVISION=20261003-queue-coverage-v6; panel 全队列补缺6; primary button remains 立即开始任务（只补缺项）.

## Evidence

Screenshot: attempted40/40, success0/partial27/failed11/skipped2, remaining0, current error figures5/7. These are attempt outcomes, not40complete papers. The actual source has no40-paper cap. Instead it excludes unknown inventory, marks every visited DOI as seen regardless of outcome, and finishes as soon as the pending first-pass array empties. A failed inventory refresh can replace that array with a smaller or empty list.

Read-only diagnostic run37038261656, artifact11241517393, readAt2026-10-02T17:04:47.512Z (Beijing2026-10-03 01:04:47). The local diagnostic snapshot started2026-10-02T16:05:10.347Z and finished16:05:15.474Z, BEFORE the screenshot's40-paper run. It reported total0 and inventoryUnknown700, with TOC库存:queue_http_503, 正文图库存:queue_http_503, 文本库存:private_http_503. Unknown layers182TOC/473body/397text overlap. This independently establishes the metadata failure path but does not reconstruct the exact40 initial queue.

During the fresh diagnostic, public TOC metadata returned200/count704 and complete staged metadata200/count529; canonical queue returned765papers. Unaunthenticated private evidence read returned401 as expected; that does not prove the user's installed token is invalid or that all text is missing. Latest report entries include a5/7body outcome matching the screenshot, but the diagnostic index alone cannot assert that all recent reports share one run ID.

## Repair

Each run now keeps per-DOI, per-layer obligations rather than only an array of unvisited papers. Failed metadata refreshes retain previously established obligations and successfully read metadata in that same run. Initial transient metadata failures have a bounded retry; qualifying HTML502/503/504 responses from the owned API may use the existing native request route to the SAME endpoint and credentials. No fallback around401/403/429, explicit extension denial, Retry-After-bearing gateway response, JSON application errors or DOI checks.

Known expected body counts can schedule missing figures even when another inventory read is absent. Papers with saved body figures but an unconfirmed total get a labelled figure-count discovery visit; already valid per-label pictures are reused. Completely unavailable inventory remains explicitly unknown, not labelled complete and not invented as all765missing. It gets bounded metadata recovery, not publisher access bypass.

The scheduler visits the complete eligible queue without an article count cutoff, and gives every first-pass article its turn before continuations. Positive new receipts requeue only the still-missing layers. One no-progress transient retry is allowed; repeated no-progress, provenance failures and access restrictions remain blocked and visible instead of creating an infinite loop. Publisher pacing waits do not discard papers. A current registry refresh still removes deleted DOI and discovers new eligible work.

Statistics are now distinct: visited unique papers, confirmed complete papers, attempt count, unresolved, pending and blocked. Remaining layer counts include blocked items. Reaching the tail does not erase27partial/11failed obligations. The terminal all_resolved state requires no unresolved or unknown items; otherwise the panel reports remaining blocked/unconfirmed work. Existing publisher per-visit safety/time bounds remain; partial progress can continue in the same overall run.

## Verification and delivery boundary

Local and Actions test suites passed157cases:18new queue coverage,29missing-only,18immediate-session,23lifecycle,30newest/retry,12upload,11receipt/release and16automatic reports. Existing fixture updates supply an actual completed-image receipt rather than pretending status=success proves an unspecified requested layer. The old unknown-body test now expects a discovery task with its valid saved images retained.

Actual Chromium with mocked GM/publisher network visited61unique missing papers under one run ID, continued beyond a failure at21, and showed60complete/1unresolved. The existing765inventory->3missing-task two-page fixture passed9interaction assertions. No console/page/network errors. Screenshot and trace from artifact11240894958 were downloaded and screenshot visually inspected. These are deterministic browser fixtures, not an installed desktop extension or authenticated publisher test.

First run37039420787 passed tests/browser/build but failed its source push because the Actions token lacks workflows permission. Its attempted workflow modifications were removed from the commit scope, without changing token permissions. Subsequent run37040289755/job110948468462 completed successfully and committed only runtime and test fixtures. Latest artifact11242101631; current source Git blob e6e460ee534103c027ec2e3f6892c1b9a687d08b matches the downloaded, tested bytes.

Tested installer281163bytes, SHA25632035446dc29a5929a55eba6e98a2b914bf8b79e1c1ef1b3a54e5a8546b8951b. Source SHA256f4e092d6576cc4550c6f3c2fa87a5d8280d30728465f292207da87373245c17a.

An additional proposed cross-refresh metadata hold refinement was blocked by the connector and is not included or transmitted through this runtime change. Do not claim that optional refinement was deployed or count its local tests in the157 above. Existing historical CI, including2.2.35 fixtures and prior-heading grep assertions, is not represented as globally passing. The new queue-coverage CI verifies the exact current panel marker and actual takeover/remaining behavior.

No literature dataset, publication schedule, model-summary schedule, media generation, credential or publication approval changes. Canonical installer deployment and actual user-browser adoption must be verified separately; this predeployment record makes no claim that the user's27partial/11failed papers have now succeeded.
