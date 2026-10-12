# 2026-10-12 — Bridge 2.2.83 owner upload: run 141 DOI diagnostic (read-only)

Context: The owner reported a newer Tampermonkey log on October 12 near 12:40 Beijing. No collector source, media objects, private PDF bytes, publication schedule or R2 indexes were modified by this analysis. Existing R2 data was read by:
- Initial sanity-check workflow #38204805638, job #114665813740 (R2 latest uploadedAt 1791780076785 = 2026-10-12 12:41:16.785 BJT).
- Extended fully **read-only** sanitized workflow #38205128046, job #114666808130 (R2 latest uploadedAt 1791780157082 = 2026-10-12 12:42:37.082 BJT), after audit-only PR #546 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/546 merged as c050f9d62b6c42c7f96cd7a785e656e3d05bc3ad.

## Current in-progress pass

- Started 2026-10-12 11:02:08.279 Asia/Shanghai. Current 12:42 upload phase: running (not terminal).
- Script protocol '6.2.20' in diagnostics is a stable API capture protocol, **not** installed user engine version. Presence of corrected scopeRecentCount/scopeHistoricalCount/inventoryAlreadySatisfiedCount is consistent with current PR #530 / engine 6.2.64 implementation, but this diagnostics header does not independently print installRevision.
- Queue generated 2026-10-12 08:00:19.131 BJT; 964 formal records = 735 Jul-Sep toc_only historical + 229 October ordinary; excluded 0. This is consistent with current main public/toc-demand-live.json.
- Candidate/coverage total: 141 DOI tasks. Actual publisher tabs visited: 49 unique DOI, 51 results/attempts. Partial: 16, failed: 35, fully resolved: 0, inventory-only already satisfied: 0. Unresolved: 141 = 49 blocked + 92 pending; cooling 0.
- Remaining layer obligations: 137 TOC + 5 owner PDF (overlapping DOI permitted; not 142 distinct).
- Current owner PDF inventory: ready 173 / pending 1 / failed 0 / missing 5 / unknown 785 across all 964 records. The 735 historical TOC-only items were deliberately excluded from PDF inventory; approximately 50 of the 785 unknowns concern October ordinary papers. `ownerPdfInventoryState=read_failed`: cannot assert the five missing are freshly and exhaustively verified in this incomplete snapshot.
- Captured output this pass: tocStored=0, figuresStaged=2, evidenceStored=14. Nine TOC index *rows were updated after the pass began*, but none is proof that this running pass produced nine new officially published TOCs. Likewise stage-index had zero rows with lastUpdatedSinceStart, so two result-level figure receipts and stage-index visibility need reconciliation.

## Confirmed technical problem A: metadata inventory read failed during run

`inventoryErrors` were:
1. `TOC库存:queue_inventory_deadline;browser:controller_native_timeout_16000ms（保留本轮上次有效库存）`.
2. `正文图库存:queue_inventory_deadline;browser:controller_native_timeout_16000ms（保留本轮上次有效库存）`.
3. `文本库存:private_inventory_deadline;browser:controller_native_timeout_16000ms（保留本轮上次有效库存）`.
4. `PDF库存第5批:PDF库存小批 13 篇:owner_pdf_inventory_inventory_deadline;browser:controller_native_timeout_16000ms`.

Code source `public/toc-mainline.user.js` uses 16s bounded metadata transport, whole capture index, complete stage-index and paged evidence reads; owner PDFs are inspected in 25 DOI batches with a bounded 13/12 split on transport failure. No known blank/deleted result is allowed to mean "missing"; cached evidence remains. Diagnosis: network/API transport and payload/refresh granularity must be measured before targeted performance repair. Simply raising the timeouts or interpreting 'unknown' as missing is unsafe.

## Confirmed technical problem B: historical Nature requests have no detected official graphic

- This latest completed-results slice had **26 Nature-family results, 26 `toc=not_found`, 0 complete**. The latest 24 traces include 22 Nature DOI traces. All 22 had `metaVisual=0` and `toc_filter_summary.accepted=0`, with images and numbered figure captions present in the loaded article DOM. Example:
  - 10.1038/s41467-026-77482-4: Jul-Sep historical `toc_only`, full article loaded, 22 images / 11 figures in final DOM, metaVisual 0; TOC filters nodes 22, noContext 17, noKind 5, accepted 0; no eligible official TOC.
  - 10.1038/s41586-026-11091-5: historical `toc_only`, 22 images, 10 figures, metaVisual 0, accepted 0.
- `toc_only` does **not** permit Figure 1 to count as an official TOC; the previously approved PR #530 correctly preserved this obligation. These results are not evidence of failed body-figure collection because body/PDF dispatch on historical papers is prohibited.
- Absence of official-graphic markup in these article pages is **not proof that the publisher issue/search/feeds contain no authentic TOC asset**. Do not relabel Figure 1 as official. Proposed separately approved repair: check verified publisher first-party authoritative metadata/issue listings, identify DOI-bound official TOC where truly present, classify truly absent official source as still unmet but no automatic repeated same-page visits, keep previously verified Figure1 card fallback and honest TOC-only scope.

## Confirmed technical problem C: RSC official TOC source extraction remains incomplete

- Current run: 16 Chemical Science/Green Chemistry result rows for 14 distinct DOIs; 15/16 had `toc=not_found` and only 1 was pending; fulltext evidence reached `stored` on 13 results. Hence successful text capture cannot be counted as official TOC acquisition.
- Owner-private PDF `already_stored` is explicitly reported for 14 RSC result rows, including **10.1039/d6sc06407h**, with `owner_cloud_inventory_ready` in its blocker reason. This improves over the older failed upload; it does not prove user PDF reader Range 206/multi-page rendering.
- 10.1039/d6sc06879k: `private_pdf_http_403`, remains blocked and no bypass is authorized.
- Because the local latest diagnostics retain only the last 24 traces (mostly Nature), the earlier RSC page-specific source/DOM candidate events are not available in this snapshot. Need targeted DOI-bound RSC source log preservation and proof from official journal listing/AJAX before any extractor change. Chemical Science official author guidelines require a graphical TOC, so do **not** automatically assume RSC has no graphical abstract. Official guideline: https://www.rsc.org/publishing/publish-with-us/publish-a-journal-article/chemical-science .

## Confirmed technical problem D: Chem publisher access/PDF obstacles

- Four Chem results: 10.1016/j.chempr.2026.103076 -> `page_doi_unverified`, PDF not requested; 10.1016/j.chempr.2026.103008, ...103043, ...103282 -> `publisher_access_gate;pdf=private_pdf_not_found`. No valid PDF receipt. Treat publisher access and target paper identity separately, never bypass a real 401/403/429 or accept a viewer HTML as PDF.

## Safe recommended next scope (await user's explicit approval for new feedback fixes)

A. Reduce metadata-index deadlines through small DOI-scoped/paginated reads, reuse validated receipts, cap concurrent reads, compare per-layer latency and maintain precise owner inventory unknown vs missing.
B. Historical Nature: use official DOI-bound alternative publisher metadata only when source-authorized; preserve fallback display, keep official requirement honest, suppress redundant visits once confirmed absent.
C. RSC: preserve per-DOI candidate diagnostics across longer runs; fix verified graphical-abstract discovery from official issue/listing/AJAX, DOI-bound identity and provenance, not random Figure 1 and not inferred media file paths. Chem publisher access errors require verification, not bypass.

The user has approved previous PR #530 only; new code modifications under these diagnostic findings require a fresh approval per PROJECT_RULES.md. The running 141-paper pass must not be cancelled or restarted merely to inspect a few last results.
