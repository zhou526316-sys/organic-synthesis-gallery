# Tampermonkey: 660 outstanding, 117 PDF and Oct-1 addedDate scope

Beijing time: 2026-10-08 12:04:18 +08:00
Context: User screenshots of Bridge controller 2.2.41, total 887, confirmed 227, unresolved 660, TOC 653, PDF 117. User requests acquisition only for Gallery addedDate >= 2026-10-01, and asks why previously acquired PDFs appear missing.
Mode: read-only diagnosis and approval hold. No capture, publication, PDF deletion, schema change, controller reset, or installer release was executed.

## Findings

- Current main full registry `public/toc-demand-live.json` (generated 2026-10-08T00:41:36.440Z): 887 rows, **177** with valid addedDate >= 2026-10-01; **268** with older addedDate; **442** with empty addedDate. The latter two cohorts must NOT be eligible for user-requested current acquisition. The two screenshot examples, 10.1002/anie.8598826 and 10.1002/anie.9140489, both have addedDate=2026-10-05 and remain in-scope.
- In `public/toc-mainline.user.js`, the cutoff is applied for one-visit bundle/private PDF eligibility, while `pairedJobs` scans the full registry for TOC obligations and `buildMissingCaptureJobs` uses its full-registry return. Manual progress `660/887` therefore includes historically admitted and undated papers. 653 TOC is the controller's inventory interpretation, not a validated count of in-scope website visual gaps.
- Same repository queue shows `visibleGapTotal=48`, `officialUpgradeTotal=119`; this is a DIFFERENT visual/publication inventory contract from the controller's `TOC=653`. Do not equate 48 with the current 177-paper missing count, or equate 653 with 653 truly absent website card visuals.
- `privatePdfQueueNeeded` is governed by local Tampermonkey `GM_getValue(PRIVATE_PDF_ATTEMPT_PREFIX + doi)`, a 30-day stored receipt and a capture-revision mismatch condition. It does NOT reconcile each candidate against `private_pdf_documents` before marking a capture obligation. The 117 reflects this pending-capture heuristic, not necessarily missing actual R2/D1 PDF bytes. The code can schedule a new bundle visit even for locally saved PDF when capture revision changed, to obtain companions.
- Independently verified prior owner inventory: `audit/architecture/private-pdf-phase3-readable-20261007.json` recorded 154 ready, 154 active, 0 raw, 0 failed out of 163 target papers, and 9 capture gaps on Oct 7. Current Oct 8 cohort 177 is larger; the old 154 snapshot is NOT a live Oct 8 PDF inventory. Never overwrite, discard or force-download these entries based on a GM cache miss.

## Answer shown to user

The current Tampermonkey queue does indeed mix historical and post-Oct-1 records. Its screenshot means 887 all-history papers, 660 unresolved obligations, 653 controller-identified TOC needs, and 117 controller-identified PDF work; this is not 660 new papers. Detailed addedDate audit: 177 in scope, 268 before Oct 1, 442 undated. Both screenshot Angew DOIs were admitted Oct 5 and are within scope.

The user's previously observed 9 PDF gaps is supported by Oct-7 authoritative Phase 3 inventory: 154 ready/active and 9 not captured of 163. The new PDF 117 figure is not proof that captured PDFs disappeared; the local GM queue and revision-based bundle revisit logic have not reconciled current server documents. The site queue currently reports 48 no-visual papers and 119 fallback-only official upgrade candidates, which is not comparable to all-history controller TOC 653.

## Proposed limited repair (approval required under PROJECT_RULES.md)

1. Gate all publisher dispatch and displayed backlog to `addedDate >= 2026-10-01`, with empty dates excluded. Retain complete 887-paper registry as read-only DOI membership authority; do not use publication `date` as a fallback for this admission filter.
2. Reconcile PDF obligations with owner-authorized private D1/R2 inventory in bounded batches. Classify ready+active, existing raw/pending verification, truly absent, and unknown inventory separately. Reuse stored PDFs rather than downloading them for another capture revision. Companion figure/full-text work may still occur on a genuine in-scope publisher visit.
3. Reconcile production official TOC and accepted Figure 1 fallback with the website visual layer and positive media receipts. Avoid standalone figure/text visits or needless official TOC replacement for accepted Figure 1.
4. In the panel, separate total in-scope papers from verified real missing DOI/layer counts and unknown inventory. Invalidate old scoped-plan caches without deleting stored files or published cards; preserve fixed 08:00 production release rules.
5. Run deterministic bounded regression, verify no old/undated DOI dispatch and unchanged PDF access/owner capability, then publish only after authorization.

Interim user action: On Gallery, Tampermonkey menu > 中止当前媒体抓取批次. This is an explicit user action that preserves receipts and stops additional out-of-scope opens. Do not clear failed-task locks or delete PDF records.

Implementation status: diagnosis only; awaiting explicit approval before repairing user-feedback scope behavior.
