Beijing time: 2026-10-07
Context: D4d dormant snapshot route
Preinstalled a fail-closed snapshot-first site-stats branch while keeping SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0. When later activated, stale/missing/error snapshot responses will return snapshot-specific 503 and will not fall back to materialized visitor scans or raw pageview scans. Current production behavior is unchanged.
