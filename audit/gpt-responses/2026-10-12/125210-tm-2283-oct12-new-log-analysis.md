# 2026-10-12 12:52:10 Asia/Shanghai — Tampermonkey 2.2.83 / TOC 6.2.64 user's newly uploaded log

Context: User said “新的日志已上传” after deployment of prior approved PR #530. The user-visible response in this turn is streamed in three parts. All findings are from actual GitHub owner-controlled read-only R2 audit jobs. No new scraping, PDF bytes, production media edits, and no source-code fixes were performed.

## First user-visible part — new upload confirmed

Latest Tampermonkey logs are indeed updated: initial snapshot uploaded 2026-10-12 12:41:16 Beijing; in-progress run started 11:02. Initial summary: 141 DOI candidate tasks, 33 failed, 0 completely verified resolved. RSC TOC not_found despite stored full text, Chem access/PDF gaps and Nature repeated not_found. Captures/stages index growth by itself does not prove website publication.

## Second user-visible part — run coverage and confirmed improvements

Extended read-only audit accessed the newer uploadedAt 2026-10-12 12:42:37 Beijing. Full catalog = 964, composed of 735 July–September TOC-only historical and 229 regular Oct new additions. Candidate tasks 141, distinct publisher pages visited 49, 51 attempts, 35 failed + 16 partial, 0 fully resolved; all 141 remain 49 blocked and 92 pending, with 137 TOC layer needs + 5 PDF needs (one overlapping DOI). Controller phase running. Target DOI 10.1039/d6sc06407h owner-private PDF now returned **already_stored**, with owner_cloud_inventory_ready signal; direct PDF reader Range 206 remains unverified. Source: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205128046.

## Final user-visible part — further per-journal diagnoses and decision

The 12:42:37 upload is a newer in-progress snapshot than the 12:41:16 one, so failed results rose from 33 to 35 (51 attempts, 49 distinct publisher visits), not a contradiction.

The 51 attempt results include: Nature 26/26 TOC not_found; in 22 retained Nature traces, article DOMs had ordinary figures and captions but 0 publisher graphical-abstract metadata and 0 accepted official TOC candidates. All sample Nature DOIs are historical TOC-only, so no body/PDF work was expected. This proves the article-side official candidate was absent or rejected, but NOT that issue/TOC pages across the publisher have no official source. Preserve verified Figure 1 fallback where present, never relabel it as official.

RSC: 16 results / 14 distinct DOIs, TOC not_found 15/16, fulltext stored for 13 results. Fourteen result rows contained private PDF already_stored, including Chemical Science 10.1039/d6sc06407h; 10.1039/d6sc06879k still returned private_pdf_http_403. Chemical Science publisher explicitly requires a graphical TOC at revision: https://www.rsc.org/publishing/publish-with-us/publish-a-journal-article/chemical-science . Thus RSC official TOC retrieval needs DOI-bound issue/search/AJAX source debugging, not classification as universally non-existent. Current latest 24 retained traces are mostly Nature; early RSC trace detail was evicted.

Chem: 10.1016/j.chempr.2026.103076 failed page_doi_unverified; 10.1016/j.chempr.2026.103008, .103043, .103282 had publisher_access_gate and no captured PDF. Explicit 403/authorization barriers must never be bypassed.

Inventory metadata had four 16s deadline failures (TOC index, figure stage index, evidence and one split owner-PDF inventory batch). Owner PDF aggregate ready 173, pending 1, missing 5, unknown 785, ownerPdfInventoryState read_failed. The 735 historical TOC-only DOI are deliberately never queried for owner PDF, leaving about 50 unknowns among the 229 current ordinary entries. Unknown must not be treated as confirmed missing. TOC index had 9 rows with update timestamps after pass start, but this is not nine verified production TOCs from the run. Results reported 2 figures staged while stage-index had 0 rows updated since run start; requires provenance/receipt reconciliation before declaring publication.

The proposed **new** repair scope, held for user's explicit approval under PROJECT_RULES.md, is:
1. DOI-scoped, incremental/paged inventory with bounded deadlines and correct per-layer diagnostic outcomes rather than repeatedly fetching whole indexes or increasing maximum wait.
2. Nature historical official-TOC source verification on DOI-linked publisher issue/search sources; if the official graphic truly does not exist, retain verified Figure 1 fallback and an honest not-available reason; avoid repeating identical article-page attempts.
3. RSC exact DOI-bound official visual acquisition diagnostics and proven issue/search/AJAX source handling. Keep existing owner PDF rights and publisher-access restrictions. Investigate Chem access separately, without bypass.
Current 141-task run is still in progress, and should not be cancelled or restarted just for diagnosis. No user log upload needed until the current run has ended.

Diagnostic audit-only PR #546 merged https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/546, changes only the read-only existing-R2 audit workflow. The detailed durable factual report was saved at audit/media-diagnostics/2026-10-12-bridge283-run141-readonly-diagnosis.md, commit b86de7424456ccb21fc25968b59ae9135ec4c7de.

Related live read workflow: #38204805638 initial, #38205128046 extended. All data reads were read-only.
