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

## Fixed production release slots: 08:00 / 18:00 Asia/Shanghai

The production Gallery has exactly two literature release slots each day: **08:00 and 18:00 Asia/Shanghai**. Discovery, machine audit, publisher checking, semantic review, and challenge review happen before those slots. They must not cause production literature cards to appear early.

The release pipeline is staged:

1. Around 06:55 / 16:55, GitHub Actions runs an independent machine discovery safety audit.
2. At 07:05 / 17:05, the primary assistant pre-review refreshes the explicit push-trigger bridge, consumes a fresh audit, and performs the first complete semantic/challenge review pass.
3. At 07:35 / 17:35, the pre-release recovery task refreshes machine discovery again when needed, reviews any late-arriving DOI delta, and brings the staging review to `ready_to_publish`.
4. At exactly 08:00 / 18:00, the production release task is the only scheduled task allowed to convert the staging review into a formal `audit/review-*.json`, write accepted papers into authoritative production literature data, refresh `public/toc-demand-live.json`, and trigger the production Pages update.

Pre-release assistant work must persist decisions only to `audit/prepublish-review-YYYY-MM-DD-0800.json` or `audit/prepublish-review-YYYY-MM-DD-1800.json`. These files are deliberately outside the formal `review-*.json` decision namespace and do not alter the authoritative accepted/excluded history.

If the staging review is incomplete at 08:00 / 18:00, the release slot fails closed: keep the previous verified production snapshot, record `publication_missed` / `incomplete_review`, and carry the unresolved work into the next fixed release slot. Do not publish new literature later at an arbitrary off-slot time merely because review eventually finished.

A Pages deployment may take a few minutes after the 08:00 / 18:00 release commit. The logical production release event is the slot-time authoritative-data commit; online verification must record the actual deployment completion time. No other scheduled task may introduce new production literature data between the two release slots.

TOC/Graphical Abstract availability remains downstream and non-blocking. Every accepted-literature production commit must feed the browser-side TOC demand path. Tampermonkey/VPN Bridge remains the sole publisher-media acquisition mainline for TOC/Graphical Abstract/Figure 1/body figures; OA PDF/HTML extraction is not part of the literature-release pipeline.

Each release report must separately state (1) records inside the three-calendar-day primary review window and (2) additional records surfaced only by the seven-day safety tail / late-deposit rescue.

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
5. Materials/heterogeneous catalysis requires affirmative evidence of a general preparative organic-synthesis scope; an organic transformation alone is insufficient. Polymer synthesis methodology itself is in scope when the central contribution is a new or substantially advanced polymerization reaction, catalyst, monomer scope, chain-control strategy, sequence/architecture control, or access to previously inaccessible polymer structures. Exclude polymer/material papers only when polymerization is merely a fabrication/application step without a general polymer-synthesis method.

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

## ChatGPT-to-GitHub execution bridge

ChatGPT scheduled-task runtimes are not required to have a local Node runner or a workflow-dispatch action. The supported execution bridge is a minimal GitHub write to `audit/automation-triggers/literature-audit-request.json`.

- Updating that file on `main` is an explicit machine-audit request. The push must trigger `.github/workflows/literature-audit.yml`.
- The GitHub Actions runner, not the ChatGPT task runtime, executes the repository capability guard and DOI-union audit.
- A ChatGPT task must inspect the resulting Actions run and consume the newly persisted `audit/latest.json`; absence of local Node or workflow_dispatch is not itself a blocker when the push-trigger bridge is available.
- If the scheduled primary task dies after writing the trigger, the machine discovery still proceeds in GitHub. A later semantic-review/terminal task may consume the fresh audit without repeating discovery.
- Semantic include/exclude/pending review remains an assistant responsibility. Machine audit success never implies semantic-review completion.
- If the trigger push succeeds but the Actions run fails or fails to persist a fresh audit, record the concrete Actions run id and failure as `source_gap` / `incomplete_review`.
- Never create a fake semantic review merely to trigger the workflow; use the dedicated automation-trigger file.

## Scheduled automation

The fixed production publication slots are 08:00 and 18:00 Asia/Shanghai.

- GitHub independent machine audit safety run: approximately 06:55 / 16:55.
- Assistant primary pre-review: 07:05 / 17:05.
- Assistant pre-release recovery/review delta: 07:35 / 17:35.
- Production literature release and deployment trigger: 08:00 / 18:00 only.
- TOC/media work remains outside the literature release gate and is handled by Tampermonkey/VPN Bridge.

All morning and evening cycles follow the same staged theory. Pre-release failures may be recovered before the slot; after the slot, a failed literature release is recorded rather than silently publishing at an arbitrary later time.
