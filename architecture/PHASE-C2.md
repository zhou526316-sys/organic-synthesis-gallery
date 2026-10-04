# Phase C2 — verified three-month acquisition selection

Date: 2026-10-04 Asia/Shanghai.

C1 publishes the content-addressed Catalog/Locator/Search/all-time membership. C2a introduced a read-only browser observer. C2a.1 delivered that observer through standalone userscript 6.2.22 / Bridge 2.2.40 and records a compact verified snapshot in existing diagnostic reports. C2b is the next step: use the same verified generation to limit **new acquisition work** while preserving the complete all-time registry and every existing receipt/checkpoint.

## Activation gate

C2b code may be built and tested in an isolated branch, but must not merge into production until the C2a.1 real installed-browser gate is satisfied.

Required real-browser evidence:
- `architecture_membership / verified_snapshot` is observed from an installed browser after the current C2a.1 deployment;
- its catalogId, memberCount, hotCount, archiveCount and cutoff match the current verified public architecture delivery.

If this evidence is absent, C2b remains staged. This is an intentional safety hold, not a build failure.

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
- if the DOI later becomes eligible again because of corrected source facts or the recent-addition window, the retained coverage row can return to pending.

Automatic and manual runs re-observe membership during long runs. A Beijing-day change, catalog change or active-set change finishes the current legal article, then stops opening old candidates and re-ranks from the new generation.

## Version compatibility on C2b activation

C2b must use a new installation version so C2a.1 clients actually receive it:
- standalone userscript metadata: **6.2.23**;
- self-contained Bridge loader: **2.2.41**;
- capture protocol/checkpoint version remains **6.2.20**;
- Controller/Worker protocol remains **2.2.39**.

No Worker protocol or stored capture format migration is required.

## Tests and delivery gates

Before activation:
- C2b membership/date/hash contract tests;
- controller recovery, queue coverage, missing-only and immediate-restart regressions with explicit verified fixture membership;
- Chromium queue/restart fixtures;
- public architecture build;
- real production-data roundtrip through the Tampermonkey verification core;
- exact Bridge packaging check for 2.2.41 + capture protocol 6.2.20;
- existing Site quality gate.

The Pages build repeats the real-data roundtrip before deployment. `pages-release-delivery.mjs` requires the acquisition-basis object to be present among the exact architecture objects, and post-deploy delivery verification hashes every architecture object on both production origins.

## Non-goals

C2b does not switch the public frontend to Hot/Archive, migrate user state, alter D1/R2 schemas, change summary schedules, change 07:35/17:35 recovery or 08:00/18:00 literature publication slots, clean Git history, delete old assets, or make global TOC/staged-figure/evidence inventory APIs active-only. Those remain later phases.
