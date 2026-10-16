# 2026-10-16 11:40+ Beijing — Owner 6.2.70 actual log throughput acceptance

User explicitly reported uploading new Tampermonkey diagnostics. This is a read-only evidence comparison for the previously approved capture-architecture repair scope. No publisher pages visited, R2 objects modified or PDF bytes opened in this audit.

## Evidence provenance
- Read-only GitHub Actions [38846612966](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846612966), completed successfully at 2026-10-16 03:40 UTC: R2 `local-captures/diagnostics/latest.json` and official/captured/body-stage indexes.
- Fresh manual snapshot: `uploadedAt=1792121540542` (2026-10-16 03:32:20.542 UTC / 11:32:20.542 Beijing); `installRevision=6.2.70`, capture protocol 6.2.20, controller revision 2.2.41; owner controller start 03:05:17.266 UTC; `phase=running` at upload, `finishedAt` not present.
- Read-only GitHub Actions [38846541291](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846541291) read rolling R2 automatic reports at 03:38:45 UTC. Full `report-index` 1000 DOI parsed without historical 6MB cap.
- PR #718 merged in `626b9bfa`, 7/7 CI successful; fixes only read-only report-index reader 6MB ceiling, with bounded 32 MiB and sanitized postdeploy layer counts.
- Installer `2.2.89` / engine `6.2.70` had independently passed dual-domain live acceptance workflow 38843007515; latest individual R2 report `diagnostic_context` also explicitly records `installRevision: 6.2.70` for Wiley and failing ACS DOI.

## Manual owner controller state, 11:32 Beijing (in progress, NOT final)
```json
{
  "registryScope":1186,"scopeHistorical":851,"scopeRecent":329,"scopeExcluded":6,
  "captureCandidateCount":1180,"totalJobs":226,"visitedDistinctDois":7,
  "attemptCount":7,"controllerFullyResolved":1,"unresolved":225,
  "blocked":64,"pending":161,"deferred":0,
  "results":{"partial":3,"failed":4,"success":0},
  "tocStored":1,"bodyFiguresStaged":3,"textEvidenceStored":1,
  "remainingNeeds":{"toc":219,"pdf":36},
  "ownerPdfInventory":{"ready":292,"pending":2,"missing":35,"historicalUnknown":851},
  "inventoryErrors":[],"ownerPdfInventoryState":"verified","phase":"running"
}
```
Do not treat the single `controllerFullyResolved` as proof of all four media layers, because the per-DOI results contain zero `success` and cloud PDF receipts are not independently established. The `unknown=851` owner PDF inventory is a historical TOC-only group, not necessarily an unauthorized Oct-1 PDF gap.

Seven individual outcomes at upload:
- Nature Comm `10.1038/s41467-026-78287-1`: production Figure 1 fallback primary visual (not official TOC), body-text stored with incomplete level, PDF `deferred_upload`.
- JACS `10.1021/jacs.6c15006`: already present TOC, current visit 2/8 figures stored, text failed, PDF `private_pdf_upload_deadline`.
- JACS `10.1021/jacs.6c15184`: already present TOC, current visit 1/7 figures, text not requested, PDF `deferred_upload`.
- JACS `10.1021/jacs.6c17168`, `...6c17310`, `...6c17366`: `bound_publisher_heartbeat_missing` on three distinct DOI.
- Angew `10.1002/anie.4139901`: `bound_publisher_heartbeat_missing`.
Controller remained `running` after these failures, not the former global stop `publisher_script_missing_3_consecutive`.

## New automatic R2 receipts after dual-domain deployment (from 2026-10-16 02:56:47 UTC)
- 8 distinct DOI with deduplicated terminal server reports: 4 partial, 4 failed, 0 success.
- 2 TOC stored receipts, 9 per-attempt figure-stage receipts across reports, **0 figure-complete attempts** where discovered>0; 2 text-stored receipts, 0 cloud PDF-stored terminal receipts, 3 locally deferred PDF terminal receipts, 1 failed PDF.
- Angew `10.1002/anie.6994984` continued AFTER the three failed JACS DOI and one failed Wiley DOI; 6/8 body figures stored, official TOC stored, fulltext `evidenceLevel=complete`, PDF only `deferred_upload`. Figure 4/5 stage attempts individually hit GM timeouts around 24–25 s.
- This transition proves the three-distinct-DOI, publisher-only heartbeat isolation does not globally terminate the remaining multi-publisher queue. It does **not** prove ACS publisher script injection recovered; three new JACS DOI failures demonstrate that upstream instability remains.
- Existing staged index around 6.18 MB / 3908 items with valid JSON, not above 32MiB. R2 local capture index 1100 rows. The old 6 MB reader failure was a diagnostic limit rather than index corruption; current 6.2.70 owner snapshot recorded no inventory errors.
- Updates to staged/TOC index since run start include writes by potentially other tasks and cannot be attributed solely to this exact manual run.

## Comparison with historical baselines (different run windows)
- Oct14 (6.2.65): 207 queue, 101 DOI visited, 111 attempts, 43 controller resolved, 43 TOCs, 2 body stage, 11 text evidence.
- Oct15 late (6.2.67): 198 queue, 9 DOI visited, 10 attempts, 1 controller resolved, 0 TOCs, ended with global stop.
- Oct16 6.2.70 at 11:32 BJT (IN PROGRESS): 226 queue, 7 DOI visited, 7 attempts, 1 controller resolved, 1 Figure1 primary, 3 stage, 1 text; no finalized throughput/remaining-state acceptance available. Do not extrapolate 7/27-min to whole-pass success or claim full 101-visit recovery.

## Residual issues, separate from proven improvements
1. Three ACS new article tabs and one Angew new tab produced publisher-script-heartbeat missing; determine injection/startup race and browser site-grant / publisher route separately from article image quality.
2. Individual publisher visits remain long (JACS figures partial and PDF deadline; Angew 6/8, two figure stage GM timeouts). Optimize persistent transfer/transport, not unbounded waits.
3. Local PDF deferred does not equal cloud stored. Verify actual owner Gallery replay drain with strict DOI/lease/hash/401/403/429 safeguards. The single PDF deadline demonstrates the fallback path remains blocking in some cases.
4. Browser frontend actual rendered primary visuals not independently checked in this R2-only acceptance; R2 stage storage is not production display.
5. Only the user’s fully finished `6.2.70` manual log can conclusively establish final visit count, stop reason, quarantined publisher coverage and end-to-end layer outcomes; this uploaded log was captured while `phase=running`.

Result: the global-stop regression and large-index inventory startup have real positive evidence, but throughput and four-layer completion **have not yet returned to accepted levels**. No new capture source change or external browser operation was performed during this diagnostic.
