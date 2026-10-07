# Phase D4e — self-healing bounded analytics fallback

Date: 2026-10-07 Asia/Shanghai.
Status: guarded snapshot activation requested; raw public analytics fallback removed in source.

D4e distinguishes strict realtime D4b readiness from snapshotSourceReady, the internally consistent materialized watermark.

The snapshot cron self-heals genuinely unhealthy materialized state in at most four 100-event pages before refresh. Public site-stats now has only bounded outcomes: primary snapshot, strict materialized, fresh snapshot fallback, or bounded-unavailable 503. The legacy raw stats function remains an admin/parity oracle and is no longer reachable from the public site-stats route.

D4d activation additionally waits for two consecutive propagated health observations before validating the exact snapshot proof generation.

Production desired SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED remains 0.

## Coherent-watermark correction

A materialized analytics source can be a valid snapshot source even when the historical backfill `complete` bit is temporarily false because newer raw events exist beyond the current materialized watermark. Snapshot eligibility now depends on internal materialized coherence (event ledger/head/global PV consistency and no materialization error), while strict public materialized readiness additionally requires the raw tail to be fully caught up.

Snapshot comparison distinguishes corruption from normal source advancement. If the source watermark has advanced after a successfully fenced snapshot was generated, comparison returns `comparable=false` with `reason=source_advanced_since_snapshot`; this is not treated as parity failure.

Rollback safety is now defined by bounded public behavior, not immediate D4b authority. After snapshot read is disabled, `materialized`, fresh `snapshot_fallback`, or explicit `bounded_unavailable` are safe rollback outcomes. `legacy_raw_fallback` and `site-pageview-v1` are forbidden.
