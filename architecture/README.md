# Gallery architecture v1 — phase A implementation

> Current active architecture policy: [CURRENT-CONTRACT.md](./CURRENT-CONTRACT.md). Historical `PHASE-*.md` notes are implementation history and may contain retired operational rules; they do not override the current contract.

Approved construction request: final architecture review, then start building, 2026-10-04.
The architecture remains globally non-authoritative for write-side workflows (`productionActivation:false`, `dispatchEnabled:false`), but the public frontend read path is now independently activatable through `frontendReadActivation:true`.

## What is implemented

The shared date contract is Beijing `D - 3 calendar months`, clamped to the target month's last day, inclusive. Adding three months to each article is NOT its inverse. Missing/invalid/future dates are retained in explicitly counted partitions. Existing `date` is identified as the compatibility source; no date is invented.

The catalog builds deterministic content-hash monthly/capacity shards, hash-bucketed DOI locators, segmented metadata search, an all-time membership registry, explicit withdrawal records, lifecycle partitions, and an **inactive** work preview. Public source record payloads are preserved exactly and round-trip compared. Duplicate DOI and private payload fields fail closed. New data does not get published by this builder.

All-time membership and Active Work have different schemas and scopes. A Hot-only/DOM/partial list can never establish withdrawal. Work eligibility and asset obligations are separate: unknown inventory means reconcile, not missing; completed layers are not recaptured. An archived recent addition receives seven Beijing dates of initial acquisition eligibility; an explicit repair requires dated authorization. These are policy helpers only, not a new scheduler. Semantic review/pending and scope-correction queues remain under their existing authority and are never cleared here.

The frontend reader verifies `release-delivery.json` v2, the exact `architecture-v1/release.json` hash, published all-time membership, the hash-pinned `current.json`, and all content-addressed catalog objects. `src/main.ts` uses it for the public read path when `frontendReadActivation:true`: the landing page loads Hot only, `?doi=` and edition links resolve Archive records on demand, global search scans search shards on demand, and historical date ranges load only matching segments. The default verified path still refuses false empty results. A full-reader failure now attempts a hash-bound Hot fallback from the same delivered architecture generation; Archive/search failures retain the Hot landing set and expose limited-read state instead of silently loading the all-time legacy corpus. Legacy full-corpus loading remains only for environments where `release-delivery.json` is genuinely absent (for example an old/local compatibility fixture).

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

1. Keep the current daily release chain unchanged: 06:55 audit → 07:05 semantic review → 07:35 recovery → 08:00 production release. No new cron, cloud/model dependency, database migration or Git history rewrite.
2. Receipt identity and frozen release inputs, not a mixture of latest audit/state, define this shadow baseline. The existing collector is reused rather than redefining admission.
3. Archive is NOT deletion. The frontend preserves the complete all-time published membership separately from the Hot DOM subset. A Hot-only page must never establish withdrawal or absence; Archive DOI resolution remains locator-based and explicit withdrawals remain authoritative.
4. Byte/DOI parity is necessary but NOT browser display parity. Frontend activation requires browser regression for Hot landing count, all-time registry preservation, Archive `?doi=` recovery, Archive search, filters, summaries, sharing and user-state decoration.
5. `presence` and `completeness` are distinct. This phase deliberately does not import the known misleading all-zero figure-gap inventory. The work output is `dispatchEnabled:false`; it must not replace toc-demand-live.json.
6. Preserve unknown and partial inventory semantics and legal in-flight uploads. Do not delete unacknowledged payloads on retirement. Stale leases need fencing before write-side changes.
7. Preserve old assets/URLs before turning off full-history Pages mirroring. Reversible read-path flags do not mean resetting main, deleting newly published papers, or rolling back user data.

## Delivery boundary

The frontend read path may consume the verified architecture generation while write-side systems remain on their existing contracts. `frontendReadActivation:true` authorizes only browser reads; `productionActivation:false` and `dispatchEnabled:false` remain explicit barriers for unrelated production consumers. No user state, summary backend, D1/R2 schema, publication data or acquisition scheduler is mutated by the frontend read switch. For deployed architecture generations, the fail-safe is bounded: verified full reader → hash-bound Hot fallback / retained Hot landing → explicit unavailable state. A production architecture verification failure must not reintroduce an all-history browser download. Legacy full-corpus loading is compatibility-only when architecture delivery is not deployed at all.
