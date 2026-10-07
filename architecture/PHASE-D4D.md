# Phase D4d — dormant fail-closed snapshot read branch

Date: 2026-10-07 Asia/Shanghai.
Status: route logic preinstalled; production snapshot read flag remains disabled.

## Route order

The public site-stats route now has three conceptual layers:

1. D4d snapshot branch — only when `SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=1`;
2. D4b materialized branch — current production path while snapshot read is disabled;
3. legacy raw fallback — retained only inside the D4b compatibility branch until D4d activation.

## Fail-closed rule

Once the snapshot flag is enabled, the request is committed to the snapshot branch. A missing, invalid, stale or errored snapshot returns a snapshot-specific 503 response.

The snapshot branch must not call:

- `materializedSiteAnalyticsStats()`;
- `siteAnalyticsStats()`;
- `site_analytics_visitors_v2`;
- `site_pageviews_v1`.

This prevents a stale snapshot from silently recreating the unbounded public-read problem.

## Current production state

`SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0`.

Therefore this commit changes no current public analytics behavior. Activation remains a separate decision after D4c production parity and cron freshness are proven.
