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

## Canonical activation and rollback

The sole production Worker deployment workflow now owns D4d activation safety.

When the generated Worker config still has `SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0`, the activation canary records an explicit skipped-success result.

When the flag is changed to 1 in a future authorized cutover, the same canonical deployment must:

1. refresh a new snapshot;
2. prove snapshot/materialized semantic parity;
3. prove the source watermark remained stable;
4. prove snapshot freshness;
5. call the public `/api/user-ui/site-stats` route without admin credentials;
6. require `readPath=snapshot` and `generation=site-pageview-v3-snapshot`;
7. require healthcheck to report snapshot read enabled.

Any failure automatically rewrites the deployed config back to 0, redeploys the Worker, and verifies that the public route is no longer on snapshot.

Activation evidence is retained for 30 days.
