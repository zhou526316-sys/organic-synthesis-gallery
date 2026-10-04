# Phase D2b2 — Live summary candidate shadow comparison

Date: 2026-10-04 Asia/Shanghai.

D2b1 merged the dormant summary-job index and D1 candidate selector. D2b2 enables only the shadow job-index write/backfill and legacy-vs-D1 comparison path in production.

## Production changes

The canonical Worker deployment:

1. applies `summary-candidate-index-v1.sql`;
2. verifies `summary_review_job_index` and `summary_review_job_index_backfill`;
3. generates production config with `SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED=1`;
4. deploys the same production summary code;
5. backfills historical summary-job metadata with a persistent R2 cursor;
6. runs repeated admin-only legacy-vs-D1 candidate comparisons;
7. preserves a short-lived comparison artifact.

The base `wrangler.toml` remains flag-free.

## Read-path authority remains unchanged

`runSummaryReviewCycle()` continues to call the legacy R2 `selectReviewCandidate()`.

The D1 selector is only called by the authenticated shadow comparison endpoint.

No D1 candidate is claimed, no model call is issued, and no summary is published from the D1 selector in D2b2.

Every shadow status/compare response must declare `readPathActive:false`.

## Job backfill

Historical `private/article-summary-jobs/` metadata is backfilled with the persistent D1 cursor.

Each call processes at most 1000 R2 objects. The deployment loop permits up to 100 pages as an operational budget. Hitting the budget is a visible shadow failure and does not reset the cursor.

New job transitions continue to write R2 first and only then dual-write metadata to D1.

An older `updatedAt` value cannot replace a newer indexed job state.

## Candidate parity

The comparison normalizes and compares:
- selected candidate DOI and object identity;
- Evidence packet hash and source hash;
- evidence level and policy;
- full eligible candidate-set fingerprint;
- Evidence/job counts;
- eligible count;
- preferred DOI eligibility;
- latest-24h published count;
- blocked policy counts.

A single compare uses one fixed `now` value for both legacy and D1 semantics.

Each comparison executes:

`legacy-before -> D1 -> legacy-after`

If legacy-before and legacy-after differ, the run is `comparable:false`; this is a source-race observation, not a D1 mismatch.

If the legacy reader reaches 10,000 Evidence/job objects, the run is also `comparable:false` because the old fixed scan may be saturated.

## Deployment overlap gate

A production deployment attempts five default comparisons using the same fixed time.

Requirements for a successful D2b2 shadow report:
- job backfill complete;
- readPathActive remains false;
- at least three comparable default runs;
- zero comparable divergences;
- candidate-set fingerprint is stable across comparable runs;
- if a candidate exists, at least one comparable preferred-DOI run also matches;
- no legacy saturation.

The deployment comparison step is `continue-on-error`. A shadow mismatch cannot take down the current site or summary publication; it blocks any later read cutover.

## Rollback

Rollback is configuration-only:
- remove `SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED=1` from generated production config;
- redeploy.

Do not delete the D1 tables or R2 job objects.

## D2b3 gate

D2b3 may only be considered after a controlled overlap window shows repeated stable, zero-divergence candidate comparisons while new job states dual-write correctly.

Even then, changing `runSummaryReviewCycle()` from R2 selection to D1 selection is a separate production cutover and requires an explicit reversible switch.

C2b acquisition filtering remains independently blocked until a real installed current Tampermonkey/Bridge runtime reports verified architecture membership evidence.
