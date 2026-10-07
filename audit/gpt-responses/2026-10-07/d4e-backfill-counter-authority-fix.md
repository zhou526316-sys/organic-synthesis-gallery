Beijing time: 2026-10-07
Context: D4e backfill-counter authority correction

Read-only production diagnostic proved all authoritative analytics data complete at 621 events while site_analytics_v2_backfill scanned/materialized maintenance counters remained 620. The sole failed readiness invariant was globalPvEqualsScanned.

The backfill counters can drift under realtime/cursor interleaving and are now diagnostic-only. Readiness uses materialized/backfill event watermark, raw ordering bound, timestamps, backfill complete for strict reads, and last_error. Counter drift remains reported but no longer causes a false unavailable state. Snapshot primary read remains paused for a proof run.
