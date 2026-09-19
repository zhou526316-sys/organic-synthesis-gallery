# Literature Update / Sync Protocol

This repository uses `audit/literature-update-state.json` as the single coordination source for literature retrieval, TOC collection, capability selection, and website synchronization. The capability registry is `audit/literature-capability.json`.

## Mandatory rule for every ChatGPT window/task

Before any literature-related action, read `audit/literature-update-state.json`.

- `fetching` / `toc_processing` with a fresh lock (<120 min): another run is active. Do not start a second literature or TOC crawl.
- `ready_to_sync` / `sync_failed`: reuse the completed fetch and TOC output. Perform sync/deploy only. Do not query Crossref/OpenAlex/publisher TOC pages again.
- `synced` with matching `dataCommitSha`: do not fetch or redeploy. Only perform lightweight production verification if requested.
- `needs_approval` / `blocked_by_concurrent_change`: do not bypass approval or overwrite concurrent work.
- stale/missing state: do not silently assume a new crawl is required; report the state problem to the primary literature-update workflow.

## Capability evolution

Before every primary fetch run, inspect `audit/literature-capability.json` and the current `main` branch for newer literature-audit, source-discovery, publisher-verification, TOC-collection, metadata-repair, or media-recovery implementations. Select the newest stable compatible implementation that is merged to `main`, preferring implementations whose relevant audit/smoke checks pass.

The selected implementation must be pinned for the entire run and recorded as a capability fingerprint/snapshot in the update state. Never hot-swap implementations in the middle of an active run.

If the capability fingerprint differs from the one recorded for the most recent completed fetch, the next primary task must re-run at least the full seven-calendar-day Beijing safety window with the upgraded capability. The normal 24-hour reuse optimization must not suppress this refresh. If the upgraded capability includes late-deposit rescue, that rescue additionally reaches back to each journal's `activeFrom` for records newly deposited inside the safety window. This is how future improvements to Crossref/OpenAlex/publisher discovery, LLM review, TOC extraction, image recovery, or metadata verification automatically propagate into production results.

Do not automatically adopt an experimental or failing implementation merely because it is newer. If a newer candidate cannot be verified as stable/compatible, keep the latest known-stable capability for production and report the candidate for review.

## Target journals and prospective activation

The canonical target list is `shared/literature-journals.js`. Do not maintain a second independent hard-coded list in fetch logic.

The original ten journals remain in scope from 2026-07-01. The following five journals are prospective additions and are in scope only from 2026-09-19 (Asia/Shanghai), inclusive: Chem, Chemical Science, CCS Chemistry, Science Advances, and Chinese Journal of Chemistry (CJC). A wider safety lookback must never backfill these five before their `activeFrom` date.

## Completeness standard

The default primary audit is a seven-calendar-day Beijing safety rescan, not a narrow one-day delta. This overlap is intentional so records deposited or indexed late are recovered automatically.

For every active journal, candidate discovery must use the union of all configured ISSNs across Crossref online-publication date, Crossref published date, Crossref created/deposit date, and OpenAlex publication date. Crossref created/deposit queries are evaluated by deposit time: when a DOI is newly deposited inside the safety window, keep it in the review universe even if its publication date predates the rolling seven-day window, provided that publication date is not earlier than that journal's `activeFrom`. This late-deposit rescue is mandatory and specifically recovers delayed metadata registration. DOI normalization/deduplication happens only after the union is formed. A record found by only one source is not discarded; it remains in the review universe and the audit report must expose cross-source disagreement.

The audit must report source-family health per journal. A source failure is never interpreted as proof that there were no papers. When an official publisher TOC/Early View/ASAP/latest-articles source is accessible, the primary assistant review must cross-check it before advancing `verifiedThrough`. If a publisher page is blocked, record that limitation explicitly and rely on the independent metadata-source union plus the overlapping safety rescan rather than silently treating the publisher check as passed.

All DOI differences must end as `include`, `exclude`, or narrowly justified `pending`. Keyword rules may prioritize review but may not silently exclude candidates. A day is eligible for closure only after the active journals for that date have no unresolved DOI differences, critical discovery-source failures are zero, and accepted records have been written to the authoritative dataset.

## Fetch workflow

The primary scheduled literature task owns capability selection, candidate discovery, LLM review, metadata verification, TOC retrieval, data commits, and first-attempt website synchronization. It must update the state file through `fetching -> toc_processing -> ready_to_sync -> syncing -> synced` (or an explicit failure state).

The primary task must always use the currently selected latest stable capability rather than a permanently hard-coded historical scraping implementation.

## Sync-only workflow

A request such as “同步一下网页 / 同步文献到网站” is a sync-only request when a recent completed fetch exists. It must consume the recorded dataset/TOC commits and must not repeat candidate discovery or TOC crawling. Capability upgrades are applied by the next primary fetch task, not by the sync-only fallback.

## Concurrency

Every state transition must fetch the current blob SHA and use that SHA for the write. Literature data and TOC updates should use minimal diffs and must not modify unrelated UI/user/account/search/API code.

A conflict on authoritative literature data, TOC mappings, or the coordination state remains a hard stop: do not overwrite it. A conflict that occurs only while persisting the derived audit report `audit/latest.json` is recoverable and must not block the whole literature run. The audit workflow uploads the fresh report as an artifact first, then refetches the newest `main`, compares `generatedAt`, and retries a non-force commit of only `audit/latest.json`. If persistence still loses repeated races, keep the artifact as the recovery source and report a warning rather than setting the project phase to `blocked_by_concurrent_change`.

## Scheduled fallback

The primary task runs at 08:00 and 18:00 Asia/Shanghai. Each fresh primary run uses the seven-day safety rescan subject to each journal's prospective `activeFrom` cutoff. A sync-only fallback runs at 08:30 and 18:30 Asia/Shanghai and is explicitly forbidden from re-fetching literature or TOCs.
