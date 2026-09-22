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

If the capability fingerprint differs from the one recorded for the most recent completed fetch, the next primary task must re-run at least the full three-calendar-day Beijing publication-rescan window with the upgraded capability. The normal 24-hour reuse optimization must not suppress this refresh. Late-deposit rescue remains independent of the three-day publication window: Crossref `created`/deposit queries retain a seven-day rescue window, and newly deposited records remain reviewable even when their publication date predates the three-day rescan, subject to each journal's `activeFrom`. This is how future improvements to Crossref/OpenAlex/publisher discovery, LLM review, TOC extraction, image recovery, or metadata verification automatically propagate into production results.

Do not automatically adopt an experimental or failing implementation merely because it is newer. If a newer candidate cannot be verified as stable/compatible, keep the latest known-stable capability for production and report the candidate for review.

## Target journals and prospective activation

The canonical target list is `shared/literature-journals.js`. Do not maintain a second independent hard-coded list in fetch logic.

The original ten journals remain in scope from 2026-07-01. The following five journals are prospective additions and are in scope only from 2026-09-19 (Asia/Shanghai), inclusive: Chem, Chemical Science, CCS Chemistry, Science Advances, and Green Chemistry. A wider safety lookback must never backfill these five before their `activeFrom` date.

## Completeness standard

The default primary audit is a three-calendar-day Beijing publication rescan, not a narrow one-day delta. The normal GPT semantic-review window is limited to three days. Recall is protected separately by a seven-day machine-only source safety tail across Crossref online/published/created and OpenAlex. Records in days 4–7 that are already accepted/excluded/pending are not re-reviewed; only a genuinely unseen DOI is surfaced again. Crossref created/deposit remains the explicit late-registration rescue, and if `verifiedThrough` falls behind because of source failures or an interrupted run, the next primary audit automatically extends the primary publication start back to the first unverified date until closure catches up.

For every active journal, candidate discovery must use the union of all configured ISSNs across Crossref online-publication date, Crossref published date, Crossref created/deposit date, and OpenAlex publication date. All source families retain a seven-day machine-only safety tail so shortening the primary GPT review window cannot reduce source recall. Crossref created/deposit queries are additionally evaluated by deposit time: when a DOI is newly deposited there, keep it in the review universe even if its publication date predates the rolling three-day publication window, provided that publication date is not earlier than that journal's `activeFrom`. This late-deposit rescue is mandatory and specifically recovers delayed metadata registration. DOI normalization/deduplication happens only after the union is formed. A record found by only one source is not discarded; it remains in the review universe and the audit report must expose cross-source disagreement.

The audit must report source-family health per journal. A source failure is never interpreted as proof that there were no papers. When an official publisher TOC/Early View/ASAP/latest-articles source is accessible, the primary assistant review must cross-check it before advancing `verifiedThrough`. If a publisher page is blocked, record that limitation explicitly and rely on the independent metadata-source union plus the overlapping safety rescan rather than silently treating the publisher check as passed.

All DOI differences must end as `include`, `exclude`, or narrowly justified `pending`. Keyword rules may prioritize review but may not silently exclude candidates. A day is eligible for closure only after the active journals for that date have no unresolved DOI differences, critical discovery-source failures are zero, and accepted records have been written to the authoritative dataset.

## Fetch workflow

The primary scheduled literature task owns capability selection, candidate discovery, LLM review, metadata verification, TOC retrieval, data commits, and first-attempt website synchronization. It must update the state file through `fetching -> toc_processing -> ready_to_sync -> syncing -> synced` (or an explicit failure state).

The primary task must always use the currently selected latest stable capability rather than a permanently hard-coded historical scraping implementation.

## Immediate publication after review

When a primary 08:00/18:00 run finishes semantic review and has one or more accepted papers, those accepted papers must be committed to the authoritative literature dataset and deployed to the production website in the same run. Do not wait for the 08:30/18:30 TOC-repair task, the next scheduled literature run, or a separate sync fallback.

TOC/Graphical Abstract availability is downstream and non-blocking. Newly accepted cards may go live with TOC explicitly pending; the TOC task can fill or upgrade media afterwards.

Every accepted-literature data commit must also feed the browser-side TOC acquisition path. Changes to authoritative literature supplements trigger `Refresh live TOC demand queue`, which rebuilds `public/toc-demand-live.json`. Tampermonkey is the preferred authenticated/browser-context acquisition path for publisher TOC/Graphical Abstract and Figure 1 fallback: it consumes the live queue, prioritizes `visibleGaps`, then `officialUpgrades`, and writes captured media through the existing authenticated Worker media-import path. The 08:20/18:20 Asia/Shanghai queue refresh is a fallback; the accepted-paper commit should trigger the queue refresh immediately. Tampermonkey/TOC failure must never delay literature-card publication. The primary run must trigger the existing production deployment path immediately after the authoritative literature-data commit, then verify that every newly accepted DOI is visible/searchable in production and report the resulting total card count. If deployment fails, record `sync_failed` with the concrete reason and retry deployment when safe; never report an accepted DOI as live until production verification succeeds.

The primary run must also report two distinct discovery counts: (1) unique records whose publication date falls inside the three-calendar-day primary review window, and (2) additional records included only by the seven-day machine safety tail / late-deposit rescue. Do not present their union as if every record were newly published inside the three-day window.

## Sync-only workflow

A request such as “同步一下网页 / 同步文献到网站” is a sync-only request when a recent completed fetch exists. It must consume the recorded dataset/TOC commits and must not repeat candidate discovery or TOC crawling. Capability upgrades are applied by the next primary fetch task, not by the sync-only fallback.

## Concurrency

Every state transition must fetch the current blob SHA and use that SHA for the write. Literature data and TOC updates should use minimal diffs and must not modify unrelated UI/user/account/search/API code.

A conflict on authoritative literature data, TOC mappings, or the coordination state remains a hard stop: do not overwrite it. A conflict that occurs only while persisting the derived audit report `audit/latest.json` is recoverable and must not block the whole literature run. The audit workflow uploads the fresh report as an artifact first, then refetches the newest `main`, compares `generatedAt`, and retries a non-force commit of only `audit/latest.json`. If persistence still loses repeated races, keep the artifact as the recovery source and report a warning rather than setting the project phase to `blocked_by_concurrent_change`.

## Mandatory quality gates

A literature run is not complete merely because a scheduled task ran or because `missingFromGallery=0`. Every completed run must satisfy four independent gates.

### Gate 1 — Discovery completeness

- Candidate discovery is the DOI union across every configured ISSN, Crossref online/published/created, OpenAlex, and publisher live sources where accessible.
- Beginning with reviews generated after 2026-09-22 18:00 Asia/Shanghai, the review artifact must contain a `sourceChecks` row for every active journal. Each row records `journal`, `status` (`checked`/`blocked`/`unavailable`), `candidateCount`, `syntheticTitleCount`, source page/type, and a reason when blocked/unavailable. A missing row is a quality-gate failure.
- A source request returning HTTP 200 is not sufficient evidence of completeness. Per-journal source-family counts and cross-source ratios must be checked.
- The seven-day machine safety tail and Crossref created/deposit rescue remain mandatory.
- The audit must compare the current source union against DOI-level historical review decisions inside the safety tail. If a DOI that was previously reviewed disappears from the current source union without an explicit global policy exclusion, record `historicalCoverageLosses`.
- Any `criticalSourceFailures`, `sourceFamilyGaps`, `sourceCoverageAnomalies`, or `historicalCoverageLosses` prevents the discovery gate from passing. Closure-day coverage anomalies prevent `verifiedThrough` from advancing.

### Gate 2 — Semantic review quality

Semantic correctness cannot be proven by one model pass. Beginning with reviews generated after 2026-09-22 18:00 Asia/Shanghai, every run uses a two-pass adversarial review:

1. First pass assigns include/exclude/pending to every unresolved DOI.
2. Challenge pass tries to falsify the first decision. For every accepted paper, actively search for reasons it should be excluded under Gallery scope. For every high-priority rejected paper, actively search for evidence that it is actually a general preparative synthetic method.
3. A decision is final only when the challenge pass independently reaches the same result and records `evidenceBasis`, `challengeDecision`, and `challengeReason`.
4. Any first/challenge disagreement remains `pending` until resolved with stronger abstract/full-text/publisher evidence. It must not be published or silently excluded.
5. Materials/heterogeneous/polymer catalysis requires affirmative evidence of broad preparative organic substrate scope; an organic transformation alone is insufficient.

The review artifact must record `qualityControl.secondPassCompleted=true` and `qualityControl.unresolvedDisagreements=0` before a run may be marked complete.

### Gate 3 — Publication consistency

- Every accepted DOI must exist in repository-owned authoritative literature data.
- Every accepted DOI must also be present in the deployed GitHub Pages data before it is reported as live.
- Every DOI rejected by the latest review must be absent from both repository and deployed data unless a later explicit correction supersedes that decision.
- The deployed unique DOI count must match the count recorded in `lastWebsiteSync.verification`.
- TOC/Graphical Abstract availability is not a publication gate; missing media is allowed to remain pending.

### Gate 4 — Regression correctness

- The stable capability guard must pass before discovery.
- DOI-level historical coverage loss inside the safety tail is a hard regression signal.
- Previously reviewed DOI sets, per-date/per-journal counts, source-family health, and policy exclusions are compared against current output.
- A capability change must trigger a fresh primary-window rescan; old results may not be reused across a discovery-capability fingerprint change.
- The end-to-end validator `scripts/validate-literature-quality-gate.mjs` must pass against repository data, deployed data, latest audit, latest review, and coordination state before the run may claim a clean completion.

The GitHub workflow `.github/workflows/literature-quality-gate.yml` independently runs these machine-verifiable invariants. A failed quality gate means the corresponding update remains incomplete even if the scheduler itself reported success.

## Scheduled fallback

The primary task runs at 08:00 and 18:00 Asia/Shanghai. Each fresh primary run uses a three-day primary semantic-review window subject to each journal's prospective `activeFrom` cutoff, while a seven-day machine-only multi-source safety tail, Crossref created/deposit rescue, and verifiedThrough catch-up remain enabled. GPT TOC repair runs at 08:30 and 18:30; the sync-only fallback runs at 09:00 and 19:00 Asia/Shanghai and is explicitly forbidden from re-fetching literature or TOCs.
