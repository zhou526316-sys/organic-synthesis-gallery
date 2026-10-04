# Phase D2b1 — Summary candidate index foundation

Date: 2026-10-04 Asia/Shanghai.

D2a.1 proved that the Evidence Index can be enabled in production shadow mode:
- Evidence backfill complete;
- 560/560 rows reconciled to legacy R2 inventory;
- DOI, evidence packet hash and source hash all match;
- readPathActive remains false.

D2b1 adds the second metadata set required before any summary-review read cutover: durable summary-review job state.

## Source of truth

R2 remains authoritative for summary-review job JSON and all existing summary-review behavior.

The new D1 shadow table stores only job-selection metadata:
- DOI;
- job R2 key;
- Evidence packet/source hashes;
- state;
- evidence level;
- text-processing policy;
- captured time;
- next retry time;
- lease expiry;
- published time;
- updated/indexed timestamps.

No model response, prompt, draft, final summary prose, Evidence plaintext or secret enters the index.

## Activation

The feature flag is:

`SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED=1`

D2b1 merges with this flag unset. Therefore:
- no production job dual-write occurs;
- no job-index backfill occurs;
- no D1 candidate selector is used by production review;
- runSummaryReviewOnce() continues to call the existing R2 `selectReviewCandidate()`.

## Job dual-write

When the flag is later enabled:
1. the existing job JSON and custom metadata are written to R2 first;
2. job metadata is upserted to D1 afterward;
3. an older `updatedAt` row cannot overwrite newer indexed job state;
4. an index failure is fail-open and cannot change the successful R2 job write.

## Historical job backfill

R2 job metadata is backfilled with a persistent cursor in `summary_review_job_index_backfill`.

Like Evidence backfill:
- one page per call;
- 1–1000 objects;
- no fixed ten-page loop;
- progress survives Worker invocations;
- invalid metadata is counted/skipped;
- a list failure preserves prior progress.

## D1 candidate selector

The D1 selector reconstructs the current R2 selector semantics exactly:
- Evidence policy filtering, including `no_external_ai` and optional unknown-policy behavior;
- matching job packet hash;
- terminal states: published / needs_manual_review / rejected;
- processing lease expiry;
- retry-wait timing;
- capture-time sort;
- evidence-level tie-break;
- DOI tie-break;
- recent published count over the latest 24 h;
- preferred DOI behavior;
- existing job key attachment even when the job references an older Evidence packet.

The selector refuses to run unless both:
- Evidence index backfill is complete;
- summary-job index backfill is complete.

## Shadow comparison

Authenticated admin-only comparison runs:
1. the current legacy R2 selector;
2. the new D1 selector;
3. an exact normalized comparison.

It compares:
- selected candidate identity and hashes;
- evidence/job counts;
- eligible count;
- preferred DOI eligibility;
- recent published count;
- blocked policy counts.

The response always declares `readPathActive:false`.

## Admin-only endpoints

- `GET /api/admin/article-summary/candidate-index/status`
- `POST /api/admin/article-summary/candidate-index/backfill?limit=...`
- `POST /api/admin/article-summary/candidate-index/compare`

They all use the existing write-token authorization.

## Database objects

- `summary_review_job_index`
- `summary_review_job_index_backfill`

The migration is also retained as `cloudflare/summary-candidate-index-v1.sql`.

## D2b2 activation gate

Do not enable the job index in production until D2b1 tests and normal Worker/site gates pass.

After that, D2b2 may enable **shadow only** and must:
1. backfill all historical job metadata;
2. prove Evidence and job backfills complete;
3. run repeated legacy-vs-D1 comparisons over an overlap window;
4. show zero candidate/count/policy divergence;
5. prove newly changing job states dual-write correctly;
6. keep model calls and claims on the legacy selector.

Only a later phase may consider changing `runSummaryReviewOnce()` to the D1 selector.

C2b acquisition filtering remains independently held until a real installed current Tampermonkey/Bridge runtime reports verified architecture membership evidence.
