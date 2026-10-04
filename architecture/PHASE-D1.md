# Phase D1 — Unified Asset Catalog shadow

Date: 2026-10-04 Asia/Shanghai.

D1 is independent of the held C2b acquisition cutover. It does not require the local Tampermonkey runtime to update and it does not change acquisition eligibility.

## Purpose

Unify the answer to **“what assets do we know this DOI has?”** without conflating four different facts:

1. **Worker/D1** — current dynamic media inventory;
2. **captured** — R2 local capture and staged article-figure inventory;
3. **completeness** — only proven when staged capture has an explicit `expectedFigureCount`;
4. **static display** — current Pages `media-index.json`, a public delivery surface and derived display snapshot.

Reviewed-summary availability is also indexed by DOI using only status/hashes/evidence level. Summary prose and private Evidence bytes are not copied.

## Semantics

### TOC / primary visual

The catalog separately records:
- official TOC published;
- fallback visual published;
- official/fallback captured;
- current Pages display visual and its kind.

A captured official TOC that is absent from Worker/D1 is a reconciliation item, not “missing”.
A Pages display image is still a real public-display fact, but cannot manufacture Worker/D1 state. The catalog preserves both.

### Body figures

The catalog separately records:
- Worker/D1 figure count;
- static Pages figure count/labels;
- captured staged figure receipts;
- expected figure count when explicitly observed.

Completeness is:

```
expectedFigureCount absent -> unknown
capturedCount < expected    -> incomplete
capturedCount >= expected   -> complete
```

Worker or static figures without an expected count remain `completeness_unknown`. A second reconciliation cohort identifies cases where capture is proven complete but static Pages still exposes fewer figures than expected. This directly fixes the old ambiguity where “figures exist but total completeness is unproved” could look like a gap.

### Evidence and summaries

An approved reviewed summary exposes only:
- source hash;
- evidence packet hash;
- evidence level;
- reviewed timestamp.

If no reviewed summary references an Evidence packet, Evidence presence remains `unknown`, not `absent`. No private Evidence, full text, signed URL, auth token or summary prose enters the D1 shadow catalog.

## Membership and generation

The build uses the exact current all-time `toc-demand-live.json` DOI set and requires:
- current repository delivery receipt;
- durable literature update state;
- live `release-delivery.json`;

to agree on DOI count and dataset SHA-256.

It reads dynamic media/capture sources while that literature generation is pinned, then rechecks the live literature delivery. If the literature generation changes during the build, D1 fails.

Media/capture sources are not a cross-system transaction. Their individual payloads are hashed and timestamps preserved, and the output explicitly declares `crossSourceAtomic:false`.

## Sources

Read-only:
- `POST /api/media/inventory { readOnly:true }`;
- `GET /api/media/local-capture-index`;
- `GET /api/article-figures/staged?inventory=1`;
- public `media-index.json`;
- public `scheduled-article-summaries.json`.

The builder does not call repair/job endpoints and cannot create D1 rows.

## Output and activation

D1 writes only a short-lived CI artifact:
- `catalog.json`;
- `report.json`.

Both carry `productionActivation:false` and `dispatchEnabled:false`.

D1 is not yet consumed by the frontend, Tampermonkey, Pages build, Worker queue, summary scheduler or media publisher.

## Next gate

Before Unified Asset Catalog can drive Active Work:
1. reconcile captured-not-published TOC and figures;
2. explain static-display vs D1 divergences;
3. decide how Evidence availability is indexed without prefix scans;
4. validate cohort metrics for Hot/Archive separately;
5. only then allow a downstream Active Work index to consume the catalog.

C2b remains independently blocked until a real installed 6.2.23/2.2.41 browser context reports a verified architecture membership snapshot.
