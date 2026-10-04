# Phase C2 — verified three-month acquisition selection

Date: 2026-10-04 Asia/Shanghai.

C1 publishes the content-addressed Catalog/Locator/Search/all-time membership. C2a first deployed a read-only Tampermonkey observer. C2b now uses the same verified generation to limit **new acquisition work** while preserving the complete all-time registry and every existing receipt/checkpoint.

## Fixed rules

- Canonical membership is never truncated to Hot.
- Hot is determined from a trusted Beijing date using `D - 3 calendar months`, inclusive, with target-month day clamping.
- An old paper newly added to Gallery is acquisition-eligible for seven Beijing calendar dates, but remains Archive in the literature lifecycle.
- Ordinary Archive, invalid/unknown dates and future dates do not create new TOC/body/evidence acquisition jobs.
- Missing media cannot extend Hot status.
- A legal job already opened before retirement may finish; stale job IDs and explicit withdrawals remain fenced.
- Explicit Archive repair authorization is intentionally not introduced in this phase.

## Authority chain

Each authorized Pages build produces a content-addressed `gallery-acquisition-basis-v1` containing DOI, record revision, first-online date/precision and Gallery added date.

The browser verifies:

```
release-delivery.json v2
  -> exact SHA256 of architecture-v1/release.json
  -> all-time membership object
  -> catalog current/lifecycle object
  -> acquisition-basis object
```

The complete `toc-demand-live.json` DOI set must equal the all-time membership set. Every acquisition-basis row must have the same DOI revision as membership. The release-time lifecycle must agree with the acquisition facts.

The current date is taken from the HTTPS `Date` response header and converted to Asia/Shanghai. Missing trusted time, malformed dates, v1 delivery, hash/count/revision/set mismatch, mixed generations or resurrection of a confirmed withdrawal fail closed for **new dispatch**. They do not delete data or reinterpret Archive as withdrawal.

## Queue behavior

The complete legacy `queue.articles` stays intact.

For both automatic and manual controllers:
- the D1 media inventory POST is limited to currently active DOI;
- new missing-TOC/body/evidence jobs are built only from the verified active DOI set;
- prior coverage/checkpoints/figures/evidence are preserved;
- a previously pending DOI that ages out becomes `retired`, not `removed`;
- if the DOI later becomes eligible again because of a corrected date or a recent-addition window, the retained coverage row can return to pending.

Automatic and manual runs re-observe membership during long runs. A Beijing-day change, catalog change or active-set change finishes the current legal article, then stops opening old candidates and re-ranks from the new generation.

## Version compatibility

- Standalone userscript install metadata: **6.2.22**.
- Capture protocol/checkpoint version remains **6.2.20**.
- Controller/Worker protocol remains **2.2.39**.
- Self-contained Bridge loader becomes **2.2.40**.

This intentionally avoids a Worker migration while still allowing installed Tampermonkey scripts to receive C2b.

## Tests and delivery gates

Site quality now runs:
- C2b membership/date/hash contract tests;
- controller recovery, queue coverage, missing-only and immediate-restart regressions with explicit verified fixture membership;
- the normal public architecture build;
- a real-data roundtrip through the Tampermonkey verification core.

The Pages build repeats the real-data roundtrip before deployment. `pages-release-delivery.mjs` requires the acquisition-basis object to be present among the exact architecture objects, and post-deploy delivery verification continues to hash every object on both production origins.

## Non-goals

C2b does not switch the public frontend to Hot/Archive, migrate user state, alter D1/R2 schemas, change summary schedules, change 07:35/17:35 recovery or 08:00/18:00 literature publication slots, clean Git history, delete old assets, or make global TOC/staged-figure/evidence inventory APIs active-only. Those remain later phases.
