# Literature Update / Sync Protocol

This repository uses `audit/literature-update-state.json` as the single coordination source for literature retrieval, TOC collection, capability selection, and website synchronization. The capability registry is `audit/literature-capability.json`.

## Publication policy amendment — per-DOI release, 2026-09-22

The user's latest instruction is: **one pending paper must not block other papers that have completed evidence-based two-pass review**. This section supersedes earlier all-or-nothing pending/zero-unresolved wording, including historical task prompts and audit notes. It does not weaken discovery completeness, semantic evidence requirements, fixed publication times or concurrency protection.

- The complete fresh compact handoff must be accounted for: every DOI has an evidence-based include/exclude/pending outcome. Missing candidate rows, truncated handoffs, unfinished challenge review, unaccounted evidence gaps, `criticalSourceFailures`, `sourceFamilyGaps`, `historicalCoverageLosses`, stale snapshots, or concurrent authoritative conflicts remain global blockers. A nonzero `sourceCoverageAnomalies` value is not by itself a fixed-slot publication blocker when both configured source families remain healthy and the paired compact/latest generations and candidate counts are complete: already discovered DOI(s) that finished evidence-based two-pass review stay eligible for `publishableDois`. The anomaly remains a closure warning, blocks `verifiedThrough` advancement across the affected date, and must be rechecked in later audits. `closureCoverageAnomalies` likewise constrain closure depth rather than clearing an otherwise valid release allowlist. Do not relabel unread work as pending merely to pass a gate.
- Include records must each have evidenceBasis and a confirming challenge decision/reason. Only the validator's explicit `publishableDois` allowlist can enter production. Exclude records remain excluded. A narrowly justified pending record retains both passes, attempted evidence URLs, missing-evidence details and a retry action; it stays out of production.
- At 08:00 / 18:00, release the verified include subset even when documented pending DOI(s) remain. Do not change pending into exclude, delete its audit history, or invent evidence to unblock a release. No arbitrary later off-slot publication is authorized.
- Production preflight uses `scripts/validate-prepublish-review.mjs <review> --allow-deferred --require-ready` AND `scripts/check-prepublish-readiness.mjs <review> --allow-deferred --require-ready`. Both actual runner checks must succeed for the current snapshot/code. Default checks without `--allow-deferred` measure full-review closure, not permission to release the verified subset.
- `ready_with_pending` means a verified subset is ready, not that every paper is finalized. `reviewComplete=false` and the actual pending count must remain visible. Legacy staging `incomplete_review` flags caused solely by documented pending records must not reintroduce an all-or-nothing block; readiness is recomputed from the full decision set. Explicit global blockers and approval/concurrent-conflict states still stop release.
- Persist all pending objects in the formal review's `pending[]` and `state.pendingReviewBacklog[]`, merging previous unresolved backlog rather than replacing it. Each backlog object preserves DOI, title, journal, original publication date, missing evidence, attempted sources, `sourceReviewFile` and `nextAction`. Read this backlog before every subsequent pre-review/recovery, including when a DOI moves outside the rolling window. Remove it only after a later evidenced final decision. Previously pending is never equivalent to rejected.
- Formal partial-release reviews contain `releasePolicy: {"mode":"per-doi"}` and normal accepted/rejected/pending arrays and counts. After successful deployment/online verification, use `state.phase=synced_with_pending`, record the actual live card count and backlog, and report `publicationChecksPassed=true`, `reviewComplete=false`. Do not overwrite the last fully completed review with an unfinished one or claim a full clean closure.
- The downstream quality gate accepts nonzero machine unresolved only when the exact unresolved DOI list is covered by the formal pending decisions AND the durable state backlog. An unknown/unreviewed DOI still fails. Pending must be absent from production. Repository and deployed DOI sets/counts must match. No numerical allowance for unexplained missing papers is permitted.
- Hold `verifiedThrough` before the earliest unresolved publication date and any source-coverage gap. Pending blocks closure of its affected dates, not publication of other verified papers. Preserve 7-day safety rescue/catch-up. A run with no publishable include and pending remaining is not a final zero-new result; zero-new proof still applies when claiming no qualifying new literature.
- A DOI first discovered only after a fixed release slot has already closed is reviewed immediately, but an evidenced `include` must not be backfilled off-slot. Persist it separately as an exact next-slot publication carryover (not `pending`) with its full two-pass evidence, source review, discovery generation, and `nextPublicationSlot`. A post-release quality gate may tolerate such an unresolved DOI only when the exact DOI is present in this durable carryover, absent from repository/deployed production, and the remaining unresolved set is exactly the union of formal evidence-pending DOI(s) and reviewed next-slot carryovers. An evidenced post-release `exclude` is persisted normally so the next machine audit can resolve it.

## Mandatory rule for every ChatGPT window/task

Before any literature-related action, read `audit/literature-update-state.json`.

- `fetching` / `toc_processing` with a fresh lock (<120 min): another run is active. Do not start a second literature or TOC crawl.
- `ready_to_sync` / `sync_failed`: reuse the completed fetch and TOC output. Perform sync/deploy only. Do not query Crossref/OpenAlex/publisher TOC pages again.
- `synced` with matching `dataCommitSha`: do not fetch or redeploy. Only perform lightweight production verification if requested. `synced_with_pending` also prohibits redundant deployment, but the next scheduled pre-review must resume the durable pending backlog.
- `needs_approval` / `blocked_by_concurrent_change`: do not bypass approval or overwrite concurrent work.
- stale/missing state: do not silently assume a new crawl is required; report the state problem to the primary literature-update workflow.

## Capability evolution

Before every primary fetch run, inspect `audit/literature-capability.json` and the current `main` branch for newer literature-audit, source-discovery, publisher-verification, TOC-collection, metadata-repair, or media-recovery implementations. Select the newest stable compatible implementation that is merged to `main`, preferring implementations whose relevant audit/smoke checks pass.

The selected implementation must be pinned for the entire run and recorded as a capability fingerprint/snapshot in the update state. Never hot-swap implementations in the middle of an active run.

If the capability fingerprint differs from the one recorded for the most recent completed fetch, the next primary task must re-run at least the full three-calendar-day Beijing publication-rescan window with the upgraded capability. The normal 24-hour reuse optimization must not suppress this refresh. Late-deposit rescue remains independent of the three-day publication window: Crossref `created`/deposit queries retain a seven-day rescue window, and newly deposited records remain reviewable even when their publication date predates the three-day rescan, subject to each journal's `activeFrom`. This is how future improvements to Crossref/OpenAlex/publisher discovery, LLM review, TOC extraction, image recovery, or metadata verification automatically propagate into production results.

Do not automatically adopt an experimental or failing implementation merely because it is newer. If a newer candidate cannot be verified as stable/compatible, keep the latest known-stable capability for production and report the candidate for review.

## Target journals and prospective activation

The canonical target list is `shared/literature-journals.js`. Do not maintain a second independent hard-coded list in fetch logic.

The original ten journals remain in scope from 2026-07-01. The following five journals are prospective additions and are in scope only from 2026-09-19 (Asia/Shanghai), inclusive: Chem, Chemical Science, CCS Chemistry, Science Advances, and Green Chemistry. A wider safety lookback must never backfill these five before their `activeFrom` date. JOC is active prospectively from 2026-09-22 as recorded in the canonical registry.

## Completeness standard

The default primary audit is a three-calendar-day Beijing publication rescan, not a narrow one-day delta. The normal GPT semantic-review window is limited to three days. Recall is protected separately by a seven-day machine-only source safety tail across Crossref online/published/created and OpenAlex. Records in days 4–7 already finalized are not re-reviewed absent new evidence; genuinely unseen DOI records and the explicit pending backlog remain reviewable. Crossref created/deposit remains the explicit late-registration rescue, and if `verifiedThrough` falls behind because of source failures, pending evidence or an interrupted run, the next primary audit automatically extends the primary publication start back to the first unverified date until closure catches up.

For every active journal, candidate discovery must use the union of all configured ISSNs across Crossref online-publication date, Crossref published date, Crossref created/deposit date, and OpenAlex publication date. All source families retain a seven-day machine-only safety tail so shortening the primary GPT review window cannot reduce source recall. Crossref created/deposit queries are additionally evaluated by deposit time: when a DOI is newly deposited there, keep it in the review universe even if its publication date predates the rolling three-day publication window, provided that publication date is not earlier than that journal's `activeFrom`. This late-deposit rescue is mandatory and specifically recovers delayed metadata registration. DOI normalization/deduplication happens only after the union is formed. A record found by only one source is not discarded; it remains in the review universe and the audit report must expose cross-source disagreement.

The audit must report source-family health per journal. A source failure is never interpreted as proof that there were no papers. When an official publisher TOC/Early View/ASAP/latest-articles source is accessible, the primary assistant review must cross-check it before advancing `verifiedThrough`. If a publisher page is blocked, record that limitation explicitly and rely on the independent metadata-source union plus the overlapping safety rescan rather than silently treating the publisher check as passed.

All DOI differences must end as `include`, `exclude`, or narrowly justified `pending`. Keyword rules may prioritize review but may not silently exclude candidates. A day is eligible for closure only after the active journals for that date have no unresolved DOI differences, critical discovery-source failures are zero, and accepted records have been written to the authoritative dataset. Closure and release of a verified subset are separate outcomes.

## Fetch workflow

The primary scheduled literature task owns capability selection, candidate discovery, LLM review, metadata verification, literature data commits and first-attempt synchronization. Staging work records `preparing`, `ready_to_publish` or `ready_with_pending`; fixed-slot publication records `syncing -> synced` or `synced_with_pending`, or an explicit failure state. Media acquisition remains exclusively downstream in Tampermonkey/VPN Bridge.

The primary task must always use the currently selected latest stable capability rather than a permanently hard-coded historical scraping implementation.

## Fixed production release slots: 08:00 / 18:00 Asia/Shanghai

The production Gallery has exactly two literature release slots each day: **08:00 and 18:00 Asia/Shanghai**. Discovery, machine audit, publisher checking, semantic review, and challenge review happen before those slots. They must not cause production literature cards to appear early.

The release pipeline is staged:

1. Around 06:55 / 16:55, GitHub Actions runs an independent machine discovery safety audit.
2. At 07:05 / 17:05, the primary assistant pre-review consumes a fresh snapshot, using the explicit push-trigger bridge only when needed, and performs semantic/challenge review.
3. At 07:35 / 17:35, the pre-release recovery task refreshes machine discovery when needed and reviews the late-arriving DOI delta plus pending evidence. Do not cancel a healthy current audit by repeatedly triggering it.
4. At 08:00 / 18:00, the production release task alone converts staging into formal `audit/review-*.json`, writes the verified include subset into production literature data, refreshes `public/toc-demand-live.json`, and triggers Pages.

Pre-release assistant work must persist decisions only to `audit/prepublish-review-YYYY-MM-DD-0800.json` or `audit/prepublish-review-YYYY-MM-DD-1800.json`. These files are deliberately outside the formal `review-*.json` decision namespace and do not alter the authoritative accepted/excluded history.

Global incompleteness at the slot fails closed: keep the previous verified production snapshot, record `publication_missed` / `incomplete_review`, and carry the unfinished work to the next slot. Documented single-paper pending is not global incompleteness: apply the per-DOI amendment above. Do not publish at arbitrary off-slot times merely because review eventually finishes.

Snapshot `generatedAt` must fall in the target slot's preceding 65 minutes and not after the slot; both diagnostic and compact `endDate` must be the target Beijing date. A prior-evening test snapshot is not the next morning's fresh audit. Never backdate a newer audit.

A Pages deployment may take a few minutes after the slot-time release commit. Record the logical production release event and actual deployment completion separately. No other scheduled task may introduce new production literature data between the two release slots.

TOC/Graphical Abstract availability remains downstream and non-blocking. Every accepted-literature production commit must feed the browser-side TOC demand path. Tampermonkey/VPN Bridge remains the sole publisher-media acquisition mainline for TOC/Graphical Abstract/Figure 1/body figures; OA PDF/HTML extraction is not part of the literature-release pipeline.

Each release report must separately state (1) records inside the three-calendar-day primary review window and (2) additional records surfaced only by the seven-day safety tail / late-deposit rescue.

## Sync-only workflow

A request such as “同步一下网页 / 同步文献到网站” is a sync-only request when a recent completed fetch exists. It must consume the recorded dataset/TOC commits and must not repeat candidate discovery or TOC crawling. Capability upgrades are applied by the next primary fetch task, not by the sync-only fallback.

## Concurrency

Every state transition must fetch the current blob SHA and use that SHA for the write. Literature data and TOC updates should use minimal diffs and must not modify unrelated UI/user/account/search/API code.

A conflict on authoritative literature data, TOC mappings, or coordination state is a hard stop: do not overwrite it. A conflict only in persisting derived audit reports is recoverable. Upload the fresh diagnostic and compact reports as artifacts first, refetch newest main, compare generatedAt, and retry a non-force commit of the paired snapshot. Preserve artifacts and report warnings if persistence loses repeated races; do not discard completed semantic work.

## Mandatory quality gates

A scheduled task firing or `missingFromGallery=0` alone is not completion. Four independent checks remain mandatory; partial publication must report its scope and pending backlog separately from full closure.

### Gate 1 — Discovery completeness

- Use all configured ISSNs, Crossref online/published/created, OpenAlex, and publisher live sources where accessible.
- Reviews after 2026-09-22 18:00 Asia/Shanghai require a sourceChecks row for every active journal: journal, checked/blocked/unavailable status, candidateCount, syntheticTitleCount, source page/type, and reasons for missing access. Unavailable counts are unknown, not zero. Machine metadata health is never a publisher live check.
- HTTP 200 alone does not establish completeness: check per-journal counts and cross-source ratios.
- Retain the seven-day safety tail and created/deposit rescue.
- Compare DOI-level historical decisions within the safety tail. Disappearance without explicit global policy exclusion records historicalCoverageLosses.
- criticalSourceFailures, sourceFamilyGaps, sourceCoverageAnomalies and historicalCoverageLosses block the discovery gate. Closure coverage anomalies block verifiedThrough progression.

### Gate 2 — Semantic review quality

Every new/unresolved DOI gets first-pass include/exclude/pending and a challenge pass. Challenge accepted papers for out-of-scope evidence, and high-priority exclusions for general preparative scope. Final include/exclude requires matching evidenceBasis, challengeDecision and challengeReason. Disagreement is attached to its pending DOI, which cannot be released. Unaccounted disagreements or incomplete challenge work remain blockers.

Materials/heterogeneous catalysis requires affirmative general preparative organic-synthesis scope; an organic transformation alone is insufficient. Polymer synthesis methodology is in scope when the central advance is a polymerization reaction, catalyst, monomer scope, chain/sequence/architecture control, or access to previously inaccessible polymer structures. Exclude when polymerization is merely fabrication/application without general methodology.

Record qualityControl.secondPassCompleted=true. Full closure requires unresolvedDisagreements=0; subset release may retain only exactly accounted disagreements confined to deferred DOI records. Do not present two passes as different models/reviewers unless they actually were.

### Gate 3 — Publication consistency

Every released accepted DOI must exist in repository-owned authoritative data AND deployed data. Every latest rejected DOI must be absent unless a later explicit correction supersedes it. Pending DOI(s) are not new production cards. Deployed unique DOI count must match lastWebsiteSync.verification. Record partial success as synced_with_pending with durable backlog; media gaps remain nonblocking.

### Gate 4 — Regression correctness

Run the stable capability guard before discovery. Preserve historical DOI/date/journal/source health regression checks and the capability-change rescan. The end-to-end `scripts/validate-literature-quality-gate.mjs` checks review, audit, repository/deployed data and coordination state. For per-DOI releases it distinguishes exact known deferred DOI(s) from unknown gaps and reports publicationChecksPassed separately from reviewComplete. A failing publication-consistency gate is not success; a documented pending backlog is not a reason to undo other correctly published cards.

## ChatGPT-to-GitHub execution bridge

Local Node and workflow_dispatch are not required in ChatGPT tasks. The formal bridge is a minimal write to `audit/automation-triggers/literature-audit-request.json` on main, which triggers `.github/workflows/literature-audit.yml`.

The GitHub runner executes the capability guard, discovery and validators. It persists diagnostic `audit/latest.json` and compact `audit/unresolved-latest.json` with the same generatedAt. Consume the complete compact unresolved array for semantic work; use latest only for diagnostics/summary. Counts and generations must match. Read large files in complete, SHA-consistent chunks; never guess missing candidates from truncation.

Inspect the actual run. If the triggering task ends after the push, later tasks consume the fresh artifact without needless rediscovery. Machine audit success never implies semantic completion. Report concrete run IDs and failures when push/Actions/persistence/source access actually fail. Do not create a fake semantic review as a trigger.

## Scheduled automation

Morning and evening follow identical staged rules: independent machine audit approximately 06:55/16:55, assistant main review 07:05/17:05, recovery 07:35/17:35, production release 08:00/18:00 only. Do not self-disable, reschedule, or create replacement tasks while executing a scheduled run. Media remains Tampermonkey/VPN Bridge only.

Before final user-visible reporting, synchronize the full response under audit/gpt-responses as required by PROJECT_RULES.md. Report actual published and deferred counts, source limitations, commits/runs, deployment/online verification, TOC demand and separate publication/closure status.


## User scope corrections and bilingual title contract — 2026-09-23

Read `audit/literature-scope-corrections.json` before reviewing or publishing, including already visible DOI(s). Explicit exclusions supersede older include decisions; they do not establish a blanket ban on all polymer or biocatalytic methods. The machine handoff includes registered corrections still visible in the Gallery and marks them `scopeCorrection`; these are correction candidates, not newly discovered publisher records. Respect the fixed 08:00/18:00 production-data release slots and report queued removals separately from actual removals.

For every include, record article-specific primary contribution, preparative transformation and evidence for scope/general synthetic utility. Sequence/material/interfacial performance, membrane activity, AI protein/domain design or pathway engineering is not enough merely because a product is synthesized. Do not reuse a generic challenge paragraph as evidence. Preserve genuine small-molecule biocatalysis and enabling total synthesis. Recheck comparable boundary entries without blanket deletion.

Write a checked `titleZh` alongside every new accepted English title before release; use chemical terminology faithfully and preserve DOI identity. The release writer requires a usable Chinese title and persists it, using an existing verified translation only where title identity matches. Translation failure is not permission to disguise the English original as Chinese. The browser must render available inline/bundled translations without an API request or storage requirement. Known user-scope exclusions must be removed from all duplicate static datasets at the fixed release, not just the rolling file.


## Immediate confirmed scope removals — user amendment, 2026-09-23

The user explicitly authorizes immediate removal of confirmed out-of-scope articles, without waiting for 18:00. This amendment supersedes earlier wording that required deletions to wait for a fixed slot. New admissions remain restricted to 08:00/18:00, and pending or insufficiently reviewed articles must not be disguised as confirmed exclusions.

The dedicated `scope-correction` marker (schema 3) allows ONLY removal of explicitly reviewed, registered DOI(s), with no added DOI, no changes to retained records or scope-policy code. It binds the previous authorized marker/parent, the exact correction registry, the two-pass correction review and the user's recorded authorization by Git blob SHA. All affected production data and the marker/review are committed atomically. The Pages gate verifies deletion-only differences and revalidates the previous authorized snapshot; it is never disabled. Historical pending and source-closure dates are preserved.

A correction registry entry is not proof of an online removal. Use `awaiting_deployment` until actual deployment and a DOI search/data-set comparison establish that the specified papers are absent and retained papers remain. Record correctedAt and deployedAt separately from the last fixed admission slot. Normal pre-review and fixed-slot release continue to read the correction registry and cannot restore old include decisions.
