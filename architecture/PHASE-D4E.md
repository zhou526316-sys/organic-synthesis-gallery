# Phase D4e — self-healing bounded analytics fallback

Date: 2026-10-07 Asia/Shanghai.
Status: final guarded snapshot activation requested after production D4b/D4c proof; raw public analytics fallback removed.

D4e distinguishes strict realtime D4b readiness from snapshotSourceReady, the internally consistent materialized watermark.

The snapshot cron self-heals genuinely unhealthy materialized state in at most four 100-event pages before refresh. Public site-stats now has only bounded outcomes: primary snapshot, strict materialized, fresh snapshot fallback, or bounded-unavailable 503. The legacy raw stats function remains an admin/parity oracle and is no longer reachable from the public site-stats route.

D4d activation additionally waits for two consecutive propagated health observations before validating the exact snapshot proof generation.

Production desired SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED remains 0.

## Coherent-watermark correction

A materialized analytics source can be a valid snapshot source even when the historical backfill `complete` bit is temporarily false because newer raw events exist beyond the current materialized watermark. Snapshot eligibility now depends on internal materialized coherence (event ledger/head/global PV consistency and no materialization error), while strict public materialized readiness additionally requires the raw tail to be fully caught up.

Snapshot comparison distinguishes corruption from normal source advancement. If the source watermark has advanced after a successfully fenced snapshot was generated, comparison returns `comparable=false` with `reason=source_advanced_since_snapshot`; this is not treated as parity failure.

Rollback safety is now defined by bounded public behavior, not immediate D4b authority. After snapshot read is disabled, `materialized`, fresh `snapshot_fallback`, or explicit `bounded_unavailable` are safe rollback outcomes. `legacy_raw_fallback` and `site-pageview-v1` are forbidden.

## Readiness-vector diagnostics

When snapshot refresh rejects a materialized source, the admin response now exposes bounded readiness fields: raw/materialized/backfill max ids, global PV, scanned/materialized/duplicate/failed counts, pending raw events, timestamps, last error, and strict/snapshot readiness flags. The canonical D4c workflow stores that response together with the post-repair status in its artifact.

This diagnostic pass runs with primary snapshot reads paused; it does not re-enable raw public fallback.

## Backfill-counter authority correction

Production diagnostics isolated the persistent D4c failure to one non-authoritative field:

- raw rows: 621;
- materialized event ledger rows: 621;
- global PV: 621;
- raw/materialized/backfill max event id: 621;
- raw/global last-view timestamps: identical;
- backfill complete: true;
- last error: empty;
- backfill scanned/materialized maintenance counters: 620.

The maintenance counters can lag when realtime materialization and cursor maintenance interleave. They are therefore diagnostics, not analytics truth. Snapshot/materialized readiness now uses the atomic materialized event watermark, backfill cursor, global last-view timestamp and error state. Counter drift remains exposed as `counterDrift` / `countersConsistent` for repair and auditing, but it cannot make a complete materialized dataset falsely unavailable.

## Production proof before final activation

With snapshot primary reads disabled, production run `37565010281` proved:

- materialized source: 621 raw rows, 621 materialized rows, global PV 621;
- backfill complete, no backfill work required in the run;
- two stable D4b parity passes;
- one-attempt D4c snapshot generation;
- exact generation match between refresh and status;
- snapshot/materialized semantic equality;
- fresh snapshot with age below one second at proof time.

The historical backfill counters remain allowed to drift as operational diagnostics and no longer affect read authority.
