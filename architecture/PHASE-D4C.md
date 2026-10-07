# Phase D4c — bounded public analytics snapshot shadow

Date: 2026-10-07 Asia/Shanghai.
Status: snapshot shadow installed; public read cutover disabled.

## Goal
Move expensive visitor-state aggregation out of the public `/api/user-ui/site-stats` request path without changing analytics semantics.

## Snapshot model
A singleton D1 row stores the complete public analytics response plus raw/materialized/page-open source watermarks and snapshot generation time.

## Source-race fence
Generation reads pageview/materialized and paper-open watermarks before and after the heavy aggregation. Any source change rejects the new snapshot and keeps the previous row intact.

## Background cadence
Production cron runs every 15 minutes for snapshot refresh. Media maintenance and scheduled-handoff backfill retain their six-hour cadence.

## Flags
- `SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED=1`
- `SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0`
- `SITE_ANALYTICS_PUBLIC_SNAPSHOT_MAX_AGE_MS=1200000`

Public `/site-stats` remains on D4b materialized reads in D4c.

## D4d cutover gate
Activate snapshot reads only after stable production parity, source-race proof, live scheduled refresh, freshness-budget proof, bounded public-read regression, and rollback behavior that never rescans visitor history.
