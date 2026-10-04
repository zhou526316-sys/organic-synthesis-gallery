# Gallery architecture v1 — phase A implementation

Approved construction request: final architecture review, then start building, 2026-10-04.
Implementation baseline: c8464f8acf9bfaf6265cdfabdc0fcbf1509dcf72. This is an additive, read-only shadow implementation, not a production switch.

## What is implemented

The shared date contract is Beijing `D - 3 calendar months`, clamped to the target month's last day, inclusive. Adding three months to each article is NOT its inverse. Missing/invalid/future dates are retained in explicitly counted partitions. Existing `date` is identified as the compatibility source; no date is invented.

The catalog builds deterministic content-hash monthly/capacity shards, hash-bucketed DOI locators, segmented metadata search, an all-time membership registry, explicit withdrawal records, lifecycle partitions, and an **inactive** work preview. Public source record payloads are preserved exactly and round-trip compared. Duplicate DOI and private payload fields fail closed. New data does not get published by this builder.

All-time membership and Active Work have different schemas and scopes. A Hot-only/DOM/partial list can never establish withdrawal. Work eligibility and asset obligations are separate: unknown inventory means reconcile, not missing; completed layers are not recaptured. An archived recent addition receives seven Beijing dates of initial acquisition eligibility; an explicit repair requires dated authorization. These are policy helpers only, not a new scheduler. Semantic review/pending and scope-correction queues remain under their existing authority and are never cleared here.

The opt-in reader verifies object hashes, pins one catalog generation, resolves old DOI without loading all months, handles explicit withdrawals, filters Hot using the shared contract, and reports incomplete global search on shard failure. It is **not imported in src/main.ts**. Full browser display parity and current-membership fencing are separate activation gates.

## Run

Node 22, no npm dependencies:

```sh
node --test architecture/tests/*.test.mjs
node architecture/shadow.mjs --as-of 2026-10-04 --out /tmp/gallery-shadow-unique
node architecture/shadow.mjs --verify-live --out /tmp/gallery-shadow-live-unique
```

Use a fresh output directory. `--verify-live` reads only the public canonical site, verifies the same-slot receipt, all file-byte hashes, exact DOI set and the unchanged delivery manifest before and after capture. It builds from the verified public payloads using the existing delivery collector, not new browser cache values. The report distinguishes this from repository-only parity. Production inputs are hashed before/after. A concurrently changed or not-yet-verified release fails; it is not repaired, re-audited or deployed by this command.

The output defaults outside public. Writing into production, source or audit directories is rejected; output directories are never overwritten or garbage-collected. Artifacts are retained for seven days, not committed as another permanent data lake.

## Final-review corrections and activation gates

1. Keep the existing 07:35/17:35 recovery and 08:00/18:00 admission/deployment chain untouched. No new cron, cloud/model dependency, database migration or Git history rewrite.
2. Receipt identity and frozen release inputs, not a mixture of latest audit/state, define this shadow baseline. The existing collector is reused rather than redefining admission.
3. Archive is NOT deletion. Before production reads only Hot, queue-coverage-v6 must understand all-time membership separately from active work, and an independent current withdrawal fence must prevent stale cached readers resurrecting a removed DOI.
4. Byte/DOI parity is necessary but NOT browser display parity. Before activation, test current Chinese-title overrides, author/order/classification handling, exclusions, saved filters, summary buttons, historical favorites and `?doi=` across real browser runs.
5. `presence` and `completeness` are distinct. This phase deliberately does not import the known misleading all-zero figure-gap inventory. The work output is `dispatchEnabled:false`; it must not replace toc-demand-live.json.
6. Preserve unknown and partial inventory semantics and legal in-flight uploads. Do not delete unacknowledged payloads on retirement. Stale leases need fencing before write-side changes.
7. Preserve old assets/URLs before turning off full-history Pages mirroring. Reversible read-path flags do not mean resetting main, deleting newly published papers, or rolling back user data.

## Delivery boundary

This phase adds code, tests, a read-only validation workflow and documentation. It does not change the live UI, userscript, production data, summaries, D1, R2, release gates or existing schedules. `productionActivation:false` and `dispatchEnabled:false` are explicit. A passing shadow report is not a claim of completed production migration or browser end-to-end acceptance.
