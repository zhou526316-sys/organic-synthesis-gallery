# Historical text v0.2.9 — fulltext coverage and observed browser index timeout

- Read-only diagnostic Beijing time: 2026-10-15 19:27:09 UTC+08:00.
- User browser screenshot: 已暂停, 已尝试 0/0, 本地错误：正式文献索引请求超时; coverage detail remains 正在对齐正式 DOI 与本机正文台账… . These are separate state indicators. 0/0 shows this batch did not start, NOT that zero stored local packets exist. A server-confirmed diagnostic only acknowledges metadata, not article text.
- Source checked: public/gallery-historical-text-pilot.user.js on main, @version 0.2.9, blob c069b92bff79864576bf667e7dacd36f87498ad8.

## Code-level failure analysis

- batchFetchJson uses GM_xmlhttpRequest with timeout=16000ms and no retry. batchLoadCanonicalCatalog(true) fetches release-delivery.json, then sequentially fetches /api/literature/catalog-view in 100-item pages, strictly checking the release catalogId and DOI revisions. For 1,151 DOI, at least 12 API pages are required. One individual timed-out page aborts the batch before DOI extraction. Root of the specific browser network timeout remains unproven; request timeout is directly reported by the image and code.
- The coverage-button handler displays an indefinite aligning placeholder until ALL catalog pages and local IndexedDB operations complete; no per-page status. Its catch hides the failing stage. A second independent potential hang is IndexedDB.open(version 2), which lacks onblocked handling; the screenshot does not prove a blocked database upgrade.
- Existing local packet keys and admin secret must remain intact. No repairs implemented without explicit approval.

## Actual full-corpus status

- Current formal catalog synchronisation: GitHub Actions #38720754831, successful at ~2026-10-15 18:33 Beijing, recordCount=1151, readConfigured=true, readPathActive=true, catalogId=fb6fe534c2a77417cbc3b214ee4dd1e15593fdd85116577400a52dd501dd9299.
- Latest completed official Europe PMC full-formal DOI source census: GitHub Actions #38507374312, 1087/1087 DOI in its 2026-10-14 catalog generation. 47 JATS+CC BY+science structure candidates; 31 complete_structure candidates and 16 partial candidates, not 47 independently permitted complete text imports.
- Separate 1087-DOI OpenAlex scan: 222 TEI-availability metadata signals, not body captures. The current catalog is net +64 over old census, but current-vs-old DOI set difference was not independently proved. Current 1151 DOI need a fresh generation-aligned source census.
- Fresh independently rerun production current-generation FTS coverage: existing owner-only #38529847731, job #116394228164, success. At 2026-10-15 19:21 Beijing: formalDois=1151, verifiedDoi=0, verifiedSections=0, publicEnabled=false, endpointResponse=ok, raw body not exported.
- Previous controlled import of one Nature Chemistry DOI and six reviewed scientific sections was under an earlier catalogId. Worker source getPublicBodyCoverage joins rows on catalogId and DOI revision, and filters only the current catalogId, so an old approved paper need not appear in new-generation counts. No proof older rows deleted; no verified migration completed.
- The owner's local IndexedDB corpus cannot be counted by GitHub Actions and the screenshot's 0 is not a local IndexedDB count.

## Fresh actual v0.2.9 browser receipts

- Existing owner-only diagnostic action #38665655983 was rerun, job #116395070391 succeeded, reading 200 latest metadata events across 133 distinct attempts.
- Real v0.2.9: 12 metadata events, representing 8 terminal attempts: 3 publisher_script_not_confirmed, 3 license_pending_load, 1 license_not_verified, 1 timeout; 0 saved_local. The remainder are old 0.2.8 events. Do not extrapolate the small sample to all 1151.

## Candidate repair package — HOLD pending explicit user approval

1. Add per-page catalog fetch progress, stage-specific failure details and finite transient retry/backoff while preserving matching catalogId/revisions; no 20 DOI business cap and no silent fallback to incomplete TOC queue.
2. Make covered IndexedDB and fetch operations fail visibly with bounded wait, no duplicate background coverage requests, and no deletion of stored packets or diagnostic credentials.
3. Generation-safe reindexing of already independently reviewed text only if current DOI/revision/source sha and article reuse rights are revalidated; never move private publisher text to public FTS.
4. Re-run full-formal DOI source census for the current 1151 cohort; preserve 100/DOI technical shards only, and distinguish source signals, local stored text, science completeness and approved FTS text.

No userscript code, FTS data, public search flag, TOC, media/PDF/SI, or daily 08:00 publication modified in this diagnosis.
