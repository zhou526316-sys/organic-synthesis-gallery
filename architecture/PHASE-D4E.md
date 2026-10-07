# Phase D4e — self-healing bounded analytics fallback

Date: 2026-10-07 Asia/Shanghai.
Status: primary snapshot read disabled; raw public analytics fallback removed in source.

D4e distinguishes strict realtime D4b readiness from snapshotSourceReady, the internally consistent materialized watermark.

The snapshot cron self-heals genuinely unhealthy materialized state in at most four 100-event pages before refresh. Public site-stats now has only bounded outcomes: primary snapshot, strict materialized, fresh snapshot fallback, or bounded-unavailable 503. The legacy raw stats function remains an admin/parity oracle and is no longer reachable from the public site-stats route.

D4d activation additionally waits for two consecutive propagated health observations before validating the exact snapshot proof generation.

Production desired SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED remains 0.
