# Phase D4d — dormant fail-closed snapshot read branch

Date: 2026-10-07 Asia/Shanghai.
Status: first production snapshot-read activation safely rolled back; activation paused for source-readiness repair.

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

`SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0` in the canonical deployment configuration after the guarded rollback.

Activation is not considered complete merely because the flag is set. The canonical D4d canary must prove live snapshot routing, freshness, parity and health. Any failure automatically redeploys with the flag returned to 0.

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

## Activation request — 2026-10-07

Prerequisites satisfied before requesting activation:

- D4c production snapshot migration: passed;
- D4c refresh: passed;
- D4c snapshot/materialized parity: passed;
- D4c snapshot artifact: preserved;
- D4d fail-closed public branch: installed;
- canonical activation canary: installed;
- automatic rollback: installed;
- Worker deployment authority regression: passed.

The production flag is now requested at 1. Final activation authority comes from the live D4d canary result, not from this source change alone.

## First activation result

The first guarded D4d activation attempt deployed snapshot reads, then failed its stable-live-proof canary and automatically rolled back.

Rollback verified the snapshot flag returned to 0. The first rollback accepted a non-snapshot public route and observed `legacy_raw_fallback`; that acceptance criterion was too weak for the scale-safety contract.

The canonical rollback is now hardened: it must repair D4b materialized readiness through the authorized bounded backfill endpoint, prove materialized/raw parity, prove the materialized compare endpoint is equal, and require the public route to return exactly:

- `readPath=materialized`;
- `generation=site-pageview-v2`.

Activation diagnostics now persist each refresh/live-proof attempt so a repeated source-race can be distinguished from a route or freshness failure.

No second activation may be attempted until the source-0 deployment proves D4b materialized recovery and D4c snapshot parity again.

## Realtime-lag correction

D4e separates strict realtime freshness from an internally consistent materialized snapshot source. A newly inserted raw pageview may still be in flight while the materialized tables remain self-consistent at the previous watermark.

Snapshot refresh may publish that stable materialized watermark inside the explicit freshness budget. The 15-minute cron repairs genuinely unhealthy materialized state in at most four 100-event pages. D4c parity can repair source-not-ready in bounded pages. D4d activation waits for two consecutive health observations of the enabled snapshot flag before checking the exact proof generation.

Public site-stats no longer uses legacy raw aggregation fallback. With primary snapshot reads disabled, transient D4b lag uses a fresh singleton snapshot as snapshot_fallback; if neither bounded read is available, the endpoint returns bounded 503.

## Activation retry #2 — D4c proof reuse

The first guarded activation attempts rolled back safely. Source history shows that commit `1a5d08df` deliberately paused the source flag back to 0 after those failures. The later D4c-proof-reuse fix therefore ran with the source flag still at 0 and could only produce a skipped activation result.

Retry #2 explicitly changes the canonical source flag back to 1 **after** the proof-race fix is present.

The canonical sequence for this retry is:

1. repair/prove D4b materialized freshness;
2. generate and prove one D4c snapshot;
3. reuse that exact D4c parity report and `snapshotGeneratedAt`;
4. verify the public unauthenticated route serves that same generation;
5. keep the snapshot read only if health/freshness/live routing all pass;
6. otherwise execute the existing automatic rollback to 0 and repair/verify D4b.

This retry does not weaken rollback or freshness requirements.

## Retry #3 safety semantics

D4d no longer requires a second strict source-stability window after D4c has generated a fenced snapshot. The D4c proof records `generationFenced=true`; activation verifies exact snapshot generation propagation and freshness.

Rollback is considered verified when snapshot reads are disabled at the edge and the public stats endpoint is bounded: strict materialized, fresh snapshot fallback, or explicit bounded-unavailable. Rollback must never re-enter the legacy raw-history path.
