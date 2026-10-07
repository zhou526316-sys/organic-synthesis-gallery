# D4f — analytics source integrity and bounded rollback

Date: 2026-10-07 Asia/Shanghai.
Status: locally verified; canonical deployment proof pending.

## Problem

Commit `9d96a441faadc9ef7cc8ced3fd5a9a686d3637a9` restored backfill maintenance counters and the completion bit as snapshot-source authority. This contradicted the production diagnosis and failed two existing behavioral tests. Those counters are maintained separately from atomic event/aggregate writes and can legitimately lag.

The public rollback branch also called `materializedSiteAnalyticsStats()`, which scans visitor populations. Therefore disabling the primary snapshot flag could undo the public-read scale boundary.

## Changes

1. Keep maintenance counters diagnostic-only. Snapshot eligibility requires an initialized, error-free materialized watermark; strict realtime readiness additionally requires completion and raw-tail catch-up.
2. During background refresh only, compare actual raw-prefix and materialized-ledger counts, verify raw-prefix membership, and compare global PV. This permits non-dense IDs and rejects interior ledger corruption or wrong aggregates. Rejection preserves the last good snapshot.
3. Bound the age of an unprocessed raw tail using the existing snapshot freshness budget. Persist its oldest pending timestamp privately inside the snapshot JSON; status and reads enforce both snapshot age and source age. Private metadata is omitted from public responses.
4. Catch up strict-readiness lag during the existing scheduled background repair, at most four pages of 100 events. A coherent but stale tail therefore remains repairable without a public recomputation.
5. Delegate public site-stats to a single bounded function: primary snapshot, fresh snapshot fallback, or explicit 503. No flag combination invokes raw or materialized history aggregation in the public handler.
6. Run behavioral analytics and deployment-contract tests before canonical deployment touches remote state. Rollback proof rejects both legacy-raw/v1 and materialized/v2 public responses.

## Verification

- Exact pre-fix behavioral suite: 12 passed, 2 failed (maintenance drift and coherent incomplete flag).
- Post-fix behavioral and deployment-contract suites: 39 passed, 0 failed.
- Behavioral cases cover real ledger holes, equal counts with wrong members, wrong PV, cursor mismatch, recorded errors, non-dense IDs, concurrent maintenance drift, uninitialized source, source expiry, bounded catch-up recovery, and one-row reads for primary/rollback/missing/stale/DB-error states.
- JavaScript syntax and canonical workflow YAML parse passed.
- Existing production snapshot flag and 15-minute schedule remain configured; completion requires the canonical live activation proof and a skipped rollback.

Background parity checks still scale with event history. They are deliberately outside the public request path. This change does not modify literature admission, media acquisition, private PDF capture, or user-library rollout.
