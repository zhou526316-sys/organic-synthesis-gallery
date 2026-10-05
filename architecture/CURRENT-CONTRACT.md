# Gallery architecture — current authoritative contract

Status: current architecture policy, effective 2026-10-05 Asia/Shanghai.

This file is the current architecture contract for the public Gallery and its scale-out data paths. Historical `PHASE-*.md` files document implementation history and validation gates; when a historical phase note conflicts with this file or the current literature-release contracts, the current contract wins.

## 1. Primary scaling invariant

No normal public request may have a cost that grows without bound with the all-time literature corpus.

The browser-visible working set, rendered-card count, media hydration set, mutable user-state operation, analytics read, and metadata-discovery operation must all be bounded independently of the total historical paper count. Full-history membership is a correctness registry, not a page payload.

## 2. Hot / Archive lifecycle

- **Hot** is the rolling last three calendar months by first-online publication date, evaluated in Asia/Shanghai.
- The cutoff is Beijing `D - 3 calendar months`, clamped to the last valid day of the target month, and is inclusive. It is not a fixed 90-day window.
- **Archive** contains older published members. Archive is retained, searchable and directly addressable; it is not deletion.
- Missing, invalid and future dates remain explicit lifecycle states. Do not invent a publication date to force a paper into Hot or Archive.
- A Hot-only DOM, search subset, task subset, cache or failed read can never prove that a DOI was withdrawn.
- Withdrawal/removal requires the explicit authoritative withdrawal/scope-correction path.

## 3. Public frontend read model

- The default landing page loads Hot only.
- The hero keeps the latest collection date only; it does not display all-time paper count or journal count.
- Exact `?doi=` links and edition DOI lists resolve individual Archive records on demand.
- Historical date filters load only the necessary date/search segments.
- All-time published membership remains separate from the visible card set and is generation/hash bound.
- A verification, generation or partial-search failure must never be presented as a definitive empty result.

## 4. Result-window rule

Hot/Archive separation is the first scale boundary; a bounded result window is the second.

- No query or date range may cause an unbounded number of paper cards to be inserted into the DOM in one render.
- Search and historical-range APIs/readers must expose pagination or a continuation cursor before the corpus reaches a size at which a single result set can dominate browser memory.
- Search responses must distinguish **total matched**, **returned in this page/window**, and **whether more results remain**.
- A hard internal result cap such as 1000 must never become a silent truncation presented as a complete answer.
- Broad historical date ranges must be chunked/cursor-based rather than resolving and rendering the entire range in one operation.
- CSS `content-visibility` and lazy media are performance aids, not substitutes for bounding DOM cardinality.

The fixed browser result window is implemented. The remaining scale-risk surface is upstream retrieval: global search and broad historical date ranges must also become cursor-bounded so the browser never materializes a large hidden result set before rendering the fixed window.

## 5. Search-index rule

A user-facing all-time search must not permanently depend on scanning every historical monthly segment in the browser.

The current segmented client search is a migration bridge. The active migration target is a generation-fenced, cursor-paged all-time metadata index in a **dedicated rebuildable D1 search database**. The primary D1 that holds user/account, analytics and private-PDF state must remain free of the FTS5 virtual tables used by literature search. Search correctness must preserve the current rule that partial index failure is not a zero-result proof. Queries shorter than the indexed trigram minimum (for example `Ni` or `Pd`) must retain an explicit compatibility path until an equivalent indexed strategy exists.

## 6. Fallback rule

Fallbacks must preserve correctness **and** the scale boundary.

For deployed architecture generations, the fallback is now bounded: verified full reader → hash-bound Hot fallback / retained Hot landing → explicit unavailable state. A production verification or Archive-query failure must not trigger an all-history legacy download. Full legacy-corpus loading remains compatibility-only for environments where architecture delivery is genuinely absent (for example old/local fixtures).

## 7. Catalog and generation integrity

- Literature records are content-addressed and grouped into bounded monthly/capacity shards.
- DOI locators remain independently addressable and revision bound.
- The all-time membership object is complete and separate from Hot/Archive display partitions.
- A frontend generation must be bound to one verified delivery/release generation; do not mix objects from different releases.
- Hash mismatch, DOI-set mismatch, record-revision mismatch, partial object failure or concurrent release change fails closed or falls back; it does not manufacture absence.
- Public read activation is independent from write-side activation. A browser read switch does not authorize publication, acquisition dispatch, summary mutation or media mutation.

## 8. Asset-state rule

For each DOI, keep these facts distinct:

1. captured bytes exist;
2. public display bytes exist;
3. Worker/D1 metadata says an asset exists;
4. completeness has actually been proven.

Captured is not automatically published. Published is not automatically complete. Unknown is not missing. Metadata indexes may live in D1; large/private bytes remain in the appropriate object store such as R2. Public frontend work must hydrate media only for the visible/near-visible card window.

## 9. Evidence and summary-discovery rule

Large Evidence/handoff inventories must be discovered through durable indexed metadata with persistent cursors rather than correctness-limited prefix scans.

R2 remains the durable byte source for Evidence and encrypted handoff payloads. D1/index rows contain bounded metadata only. Backfill progress must survive invocations; fixed page-loop ceilings are not correctness boundaries. A D1/index read may become authoritative only after parity/freshness gates and must retain a safe legacy fallback until rollback has been proven.

## 10. User-library rule

Per-user paper state must scale by row/key, not by endlessly enlarging one serialized library document.

The row-oriented D1 read model is the migration direction. Legacy state may remain as a compatibility/write authority only while parity and rollback require it. The current legacy document-size ceiling is not an acceptable final architecture. The next write-side phase must move toward row-authoritative per-paper mutations with revision fencing and a reversible legacy compatibility period; no paper state may be silently dropped during migration.

## 11. Analytics rule

Raw pageview events may remain append-only evidence, but public statistics must read bounded/materialized aggregates when freshness is proven. If aggregate freshness cannot be proven, fall back safely; never return partial aggregates as complete. Normal public stats reads must not require scanning the entire raw event history.

## 12. Publication and mutation authority

- New literature admission has one active production slot: **08:00 Asia/Shanghai**.
- Active chain: 06:55 machine audit → 07:05 semantic review → 07:35 recovery → 08:00 release.
- The former 18:00 slot is historical only.
- Verified late includes roll to the next 08:00 slot; they are not admitted off-slot.
- Confirmed deletion-only scope corrections retain their separately authorized immediate-removal path.
- UI/media-only deployment may reuse an exact receipt-backed literature baseline; it does not create a new literature release.
- Architecture readers/builders never redefine literature admission authority.

## 13. Cross-system boundary

Frontend Hot/Archive behavior, acquisition eligibility, media repair, summaries, user state and analytics are separate authority domains. An optimization in one domain must not silently redefine membership or work in another. In particular, a frontend Hot subset is never the acquisition or withdrawal truth unless a separately authorized contract explicitly says so.

## 14. Required regression gates

Architecture changes must test at least:

- exact Hot cutoff behavior, including month-end clamping;
- Hot landing membership;
- complete all-time membership preservation;
- Archive exact-DOI deep link;
- Archive search and historical date retrieval;
- partial-search failure not becoming false zero;
- explicit withdrawal not being inferred from absence in Hot;
- bounded card-render/result-window behavior;
- search truncation/pagination semantics;
- bounded fallback behavior;
- record/hash/generation parity;
- summaries, sharing and user-state decoration on Archive records;
- rollback/fallback after index or materialized-read failure.

## 15. Current priority order

1. **P1 — indexed all-time search shadow:** create the dedicated search D1, import only a receipt-verified architecture generation, and require repeat static-reader ↔ D1 parity while the public read path remains off.
2. **P1 — bounded search/date cutover:** expose generation-bound cursor APIs and remove browser-side linear historical search / broad-range materialization only after shadow parity is proven. Preserve the short-query compatibility path.
3. **P1 — user-library D3c:** move writes toward row-authoritative state and remove the monolithic-document size ceiling only after verified dual-path parity.
4. **P2 — registry hot-path cleanup:** prevent all-time registries or equivalent correctness metadata from being repeatedly serialized on ordinary card renders once their size becomes material.
5. **P2 — continue index/materialization cutovers:** any remaining metadata path that still relies on corpus-wide/prefix-wide scans must migrate behind parity/freshness gates.

These priorities are scale-safety work. They do not alter the Tampermonkey acquisition workflow in this architecture task.
