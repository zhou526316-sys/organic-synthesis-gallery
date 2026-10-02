# Missing-only immediate capture v4 — 2026-10-02

User request: 从头开始抓的时候不要每次都显示700多所有的文献，只把缺的显示出来，并显示目前是抓的缺什么的。再看看目前的日志看是否能再优化一下脚本。

Baseline main3b0e05ec0caa30f05773b10168958c8205bb57d9. This supersedes the previous explicit all-paper recapture selection, not immediate session replacement. Preserve Bridge/controller2.2.39, protocol6.2.20, generation1790082000000, tokens, positive capture receipts, DOI/provenance guards and publication authorization. No literature or scheduled-task changes.

## Current read-only evidence

Diagnosis run37025402701/artifact11235186938 read at2026-10-02T15:13:17.033Z (Beijing23:13). Canonical queue generated2026-10-02T10:00:19.765Z,765 unique papers, latestAddedDate2026-10-02/latestAddedCount39. These corpus numbers are not missing counts.

The recent report index returned60 latest per-DOI records:35success,22partial,3failed, out of745 reported DOI records. This is a bounded sample, not an all-site failure rate or proof of a running browser. The failed-history endpoint's663 matched entries are historical attempts, not663 distinct failed papers. Manual local-diagnostics uploaded at2026-10-02T12:20:04.636Z is older than the recent reports and is not the current desktop state. The evidence-inventory read without a credential returned401; therefore no live fulltext inventory count is claimed. The installed script uses its existing write token for that private read.

10.1021/jacs.6c12163: latest partial final report toc=stored,figures=19/30,evidence=stored; full-text evidence level complete. Immediate v3 always requested all three layers with recaptureFromHead=true, which disables same-figure checkpoint skipping. v4 retains proven saved19 and downloads only remaining11 in the corresponding regression fixture, without claiming those live11 are now uploaded.

10.1021/jacs.6c09785 had an80-character unloaded shell and no candidates;10.1126/sciadv.aeg4594 had a117-character shell. Those must not establish that the real papers contain zero images.10.1126/science.aef3511 reported publisher_access_gate; this remains an access/authentication boundary, not an invitation to bypass it.10.1002/anie.3744091 reported missing bound publisher heartbeat; exact installed browser injection/network cause remains unverified.

## Selection and display

Immediate click still synchronously revokes the old session/active job and begins new network reads, without awaiting old locks, old-page closure or old-task rechecks. The new run reads metadata only: current production inventory in bounded250-DOI chunks, TOC capture inventory, complete staged figure metadata, private text inventory, and the browser's valid local receipts. These necessary reads determine which tasks exist; do not promise zero network latency.

Only verified missing layers produce tasks. Every eligible paper has captureToc/captureFigures/captureEvidence set to its actual needs. Complete captured papers do not enter the denominator. Already staged but unpublished images count as acquired, not as missing acquisition. Text levels complete/partial/abstract_only remain distinct; existing partial/abstract evidence is sufficient for the normal acquisition backlog and is not falsely called full text. Unknown, corrupted, truncated or unavailable inventory stays visibly unconfirmed, never becomes either all-complete or all765missing.

All site addedDate batches sort descending before journal rank, not just the latest cohort. For legacy rows lacking addedDate, date is a fallback. Within a batch: Nature,Science,Nature subjournals,Science subjournals,JACS,Angew,Chem,others. Current DOI registry validation and removal filtering remain intact.

Panel marker: 缺项补抓4. Primary button: 立即开始任务（只补缺项）. New fields 本篇缺项,正在补抓,文本情况,剩余缺项 and expandable next12missing-paper preview. Partially completed tasks are shown separately from failed tasks. While inventory loads, no full-corpus denominator is displayed. Counts of TOC/body/text needs overlap by design and do not sum to unique papers.

A completed explicit pass no longer falls through to the old all-corpus automatic scheduler. The active pass refreshes its pending inventory at between-paper boundaries, and another immediate click starts a fresh missing-only pass. No new recurring ChatGPT task is created.

## Targeted acquisition optimizations

Per-label figure receipts are reconciled across production, R2 stage and local checkpoint using hash/source/quality and DOI checks. Expected discovered count is retained even if a later blank-page attempt reports0. The20new-image-per-visit cap counts only new downloads; saved receipts can be reused before that cap. URL identity ignores signature query differences while preserving DOI/source identity. No image-quality thresholds were lowered.

Worker /api/article-figures/staged?inventory=1 is a new compact read-only complete metadata mode, not the old2000entry capped listing. It rejects unreadable/corrupt indexes with503 rather than synthesizing an empty inventory. Existing default stage listing/import/promotion behavior is unchanged. Production /api/media/inventory adds per-label capturedFigures metadata, avoiding an invalid sum/max of disjoint inventories. No raw text or image bytes are included in these new responses.

Empty-shell detection now covers other publishers too. A short empty page displays loading, waits a bounded30seconds and reports publisher_page_not_ready rather than no-paper-images. Actual authentication/rate-limit and cross-DOI errors keep their existing protections. A requested text failure cannot be counted as complete task success merely because a picture was saved.

## Verification

Run37027958273/job110907296340 succeeded; artifact11235632792 contains readable exact sources, installer, tests and browser trace/screenshots.29new missing-only tests,18immediate-session tests,23controller-recovery tests,30newest/retry,12upload,11receipt/release and16automatic-report cases passed, plus private text provenance tests. Existing immediate fixtures were adapted to verified missing inventories and recaptureFromHead=false; session-fencing assertions remain. Initial branch run37027772156 stopped at strict whitespace check due an extra include EOF blank line, corrected without relaxing diff checks.

Real Chromium with mocked GM/publisher network passed9 flow checks:765inventory->3tasks, TOC-only flag/label, figure/text previews, no765denominator, repeated click restart, two-page takeover, late-result fencing, text-only next job and saved-data preservation. Console/page/network failures0. Screenshots visually inspected. This is not the user's installed extension or authenticated publisher capture.

Downloaded source bytes matched locally tested public/toc-mainline.user.js, both Worker files, helper and both new tests. Installer SHA256:c82545901ad5b00c8b86412623f30f2de6584514e8ee3a8cf84c72fcb4274714. TOC source SHA256:79a52328c08dfd9b8ab820eb835dfc9443ba04e18a263e723846f4d60b8cc077.

Canonical deployment and live new inventory mode must still be verified after merge. No desktop adoption, exact personal missing-text count or successful recapture of historical failures is established by these tests. Historical2.2.35 CI mismatches are not declared passing.
