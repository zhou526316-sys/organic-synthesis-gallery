# Phase D2b2 — Enable summary candidate index shadow comparison

Date: 2026-10-04 Asia/Shanghai.

D2b1 merged the dormant summary job index and D1 candidate selector. D2b2 enables only their **shadow metadata/backfill/comparison** path in the canonical production Worker. The production model-review selector remains the existing R2 implementation.

## Production changes

The canonical Worker deployment now:

1. applies `cloudflare/summary-candidate-index-v1.sql` to production D1;
2. verifies `summary_review_job_index` and `summary_review_job_index_backfill` exist;
3. generates the production Worker config with:

`SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED = "1"`

4. deploys the same production selector;
5. backfills historical summary-job metadata through a persistent R2 cursor;
6. compares legacy R2 and D1 candidate selection repeatedly;
7. stores a short-lived comparison report artifact.

## No read cutover

`runSummaryReviewCycle()` continues to call:

`selectReviewCandidate(env, ...)`

It does not call `selectSummaryCandidateFromIndex()`.

The admin D1 selector and compare endpoint are diagnostic-only. A D2b2 mismatch cannot select a model job, claim a lease, publish a summary or change the 12:00 scheduled pipeline.

## Comparison contract

A parity attempt runs:

```
legacy-before
  -> D1 indexed selection
  -> legacy-after
```

The attempt is comparable only when legacy-before and legacy-after are identical.

Comparison includes:
- selected candidate identity;
- Evidence packet/source hashes;
- Evidence level/policy/captured time;
- existing job key;
- Evidence count;
- job count;
- eligible count;
- blocked-policy counts;
- recent-published count;
- preferred DOI eligibility;
- SHA-256 fingerprint of the entire ordered eligible candidate list.

If legacy R2 Evidence or job count reaches 10,000, the attempt is `comparable:false` because the old reader may have reached its fixed scan ceiling.

## Production overlap check

After job-index backfill is complete, the deploy step:

1. reconciles indexed job count to current legacy job count while legacy remains below 10,000;
2. obtains at least three stable comparable default snapshots;
3. requires every comparison to have `same:true`;
4. requires the complete candidate-set fingerprint to match;
5. if there is a selected DOI, runs a preferred-DOI comparison too.

The shadow step is `continue-on-error`. A mismatch blocks future D1 read activation, not production deployment.

## Dual-write behavior

When the flag is enabled, every existing R2 job write is followed by a fail-open D1 metadata upsert.

An older job `updatedAt` value cannot overwrite a newer indexed state.

Historical job backfill:
- advances one opaque R2 cursor page per call;
- processes at most 1000 objects per page;
- persists progress in D1;
- has no fixed ten-page correctness ceiling.

## Rollback

Remove `SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED = "1"` from generated production Worker configuration and redeploy.

Do not delete:
- R2 job objects;
- D1 job-index rows;
- Evidence Index rows.

The legacy selector remains available throughout D2b2, so rollback does not require rebuilding job state.

## D2c gate

Do not switch `runSummaryReviewCycle()` to D1 until:
- job-index backfill is complete;
- dual-write remains stable across real job transitions;
- multiple deployments/overlap windows show zero candidate fingerprint divergence;
- policy-blocking behavior is identical;
- retry/lease transitions remain identical;
- rollback from D1 reads to R2 is tested.

Historical encrypted-handoff index completeness remains a separate gate for handoff-reader migration.

C2b acquisition filtering is independently blocked until a real installed current Tampermonkey/Bridge runtime reports verified architecture membership evidence.
