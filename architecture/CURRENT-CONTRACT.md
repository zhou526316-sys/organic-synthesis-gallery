# Gallery architecture — current authoritative contract

Status: current architecture policy, updated 2026-10-06 Asia/Shanghai.

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
- The initial landing payload is independently bounded from the full Hot corpus. A hash-bound Hot-head object carries at most one desktop result window (24 records, plus only the bounded future-date cushion needed for date rollover correctness) and compact date buckets for the complete Hot count.
- The browser may show the verified Hot head before all-time membership/catalog initialization finishes. The all-time registry is initialized in the background and upgrades the same page to full `architecture-v1` without redefining the already rendered Hot records.
- The full Hot compatibility snapshot must not be downloaded on ordinary first paint. It is an on-demand compatibility path for interactions that genuinely need more Hot rows, such as later pages or local reader-count sorting.
- Mobile rendering is additionally bounded to 2 cards per page; desktop rendering is bounded to 24 cards per page.
- The hero keeps the latest collection date only; it does not display all-time paper count or journal count.
- Exact `?doi=` links and edition DOI lists resolve individual Archive records on demand.
- Historical date filters load only the necessary date/search segments.
- All-time published membership remains separate from the visible card set and is generation/hash bound.
- The browser may keep complete all-time membership inside the verified architecture reader for correctness, but it must not reserialize that full DOI membership into DOM nodes, hidden JSON scripts, public diagnostics, or other page payloads. DOM diagnostics may expose only bounded summaries such as scope, completeness and count.
- A verification, generation or partial-search failure must never be presented as a definitive empty result.

## 4. Result-window rule

Hot/Archive separation is the first scale boundary; a bounded result window is the second.

- No query or date range may cause an unbounded number of paper cards to be inserted into the DOM in one render.
- Search and historical-range APIs/readers must expose pagination or a continuation cursor before the corpus reaches a size at which a single result set can dominate browser memory.
- Search responses must distinguish **total matched**, **returned in this page/window**, and **whether more results remain**.
- A hard internal result cap such as 1000 must never become a silent truncation presented as a complete answer.
- Broad historical date ranges must be chunked/cursor-based rather than resolving and rendering the entire range in one operation.
- CSS `content-visibility` and lazy media are performance aids, not substitutes for bounding DOM cardinality.

This rule is now implemented for normal all-time search and broad historical filtering through the generation-fenced indexed read path. Compatibility-only cases such as two-character chemistry queries and reader-count sorting remain on the bounded static path.

## 5. Search-index rule

A user-facing all-time search must not permanently depend on scanning every historical monthly segment in the browser.

The current segmented client search is an acceptable migration bridge while the corpus is small, but the long-term path must use a bounded-fanout index (for example a compact server/D1 metadata index or an equivalent content-addressed inverted index). Search correctness must preserve the current rule that partial index failure is not a zero-result proof.

### P1 indexed-read cutover gate

The dedicated literature metadata/FTS index is a read optimization, not a new literature authority.

- The browser must first verify the static Pages architecture generation and obtain its content-addressed `catalogId`.
- D1 may serve a filtered view only when the Worker explicitly reports the indexed read path active and the requested `catalogId` is a ready generation.
- Every D1 result DOI/revision must match the verified all-time membership and the content-addressed record before card metadata is rendered; D1 metadata alone is never card authority.
- Indexed responses are bounded to the result-window size and must expose total matched, current count, continuation state and an opaque scope-bound cursor.
- The browser must never treat D1 failure, generation-not-ready, malformed responses or cursor failure as an empty result. It may fall back only to the bounded verified static Archive reader; if the static result/fanout guard is exceeded, retain the verified Hot state and expose limited-read status rather than fabricate completeness.
- Two-character chemistry searches such as `Ni` / `Pd`, reader-count sorting, edition ordering and exact DOI deep-link behavior remain on their compatibility/static paths until separately proven equivalent.
- The default Hot landing remains static/content-addressed; D1 is for all-time/historical filtered discovery rather than replacing the Hot truth surface.
- The primary D1 remains FTS-free. The rebuildable search index stays isolated in the dedicated Literature Index D1.
- A frontend cutover must be separately activatable and reversible. Enabling the Worker read flag alone must not bypass frontend generation fencing or compatibility fallbacks.

## 6. Fallback rule

Fallbacks must preserve correctness **and** the scale boundary.

The current full legacy-corpus fallback is a temporary migration safety net. It must not remain the final fallback once historical volume grows materially. The target fallback is a verified compact Hot snapshot plus exact DOI/date/search Archive retrieval. A degraded architecture path must not reintroduce an all-history browser download that can recreate the failure the architecture was designed to prevent.

## 7. Catalog and generation integrity

- Literature records are content-addressed and grouped into bounded monthly/capacity shards.
- DOI locators remain independently addressable and revision bound.
- The all-time membership object is complete and separate from Hot/Archive display partitions.
- A frontend generation must be bound to one verified delivery/release generation; do not mix objects from different releases.
- Hash mismatch, DOI-set mismatch, record-revision mismatch, partial object failure or concurrent release change fails closed or falls back; it does not manufacture absence.
- Public read activation is independent from write-side activation. A browser read switch does not authorize publication, acquisition dispatch, summary mutation or media mutation.

## 8. Asset-state rule

- Public media inventory is display-window bounded: the browser may inspect only DOI keys already rendered in the current result window, and public inventory requests are read-only. Creating/updating media repair rows through the inventory route requires authenticated write authorization.

For each DOI, keep these facts distinct:

1. captured bytes exist;
2. public display bytes exist;
3. Worker/D1 metadata says an asset exists;
4. completeness has actually been proven.

Captured is not automatically published. Published is not automatically complete. Unknown is not missing. Metadata indexes may live in D1; large/private bytes remain in the appropriate object store such as R2. Public frontend work must hydrate media only for the visible/near-visible card window.

## 9. Evidence and summary-discovery rule

- Summary candidate discovery must have a bounded selector path: normal D1 selection may scan at most a fixed evidence window and must return an explicit non-definitive/window-exhausted result rather than fabricate an empty candidate set. Exact preferred-DOI selection remains one-row addressable. The legacy/full-set selector may remain only for shadow parity until a separately proven cutover.

Large Evidence/handoff inventories must be discovered through durable indexed metadata with persistent cursors rather than correctness-limited prefix scans.

R2 remains the durable byte source for Evidence and encrypted handoff payloads. D1/index rows contain bounded metadata only. Backfill progress must survive invocations; fixed page-loop ceilings are not correctness boundaries. A D1/index read may become authoritative only after parity/freshness gates and must retain a safe legacy fallback until rollback has been proven.

## 10. User-library rule

Per-user paper state must scale by row/key, not by endlessly enlarging one serialized library document.

The row-oriented D1 model is the migration direction. The current legacy document-size ceiling is not an acceptable final architecture. D3c1 established revision-fenced shadow parity, D3c2 proved bounded V3 reads, and D3c3 moves the browser to V3-first reads with whole-attempt legacy fallback. D3c4a preinstalls bounded dirty-key V3 mutation, same-transaction D3b compatibility mirroring, and bounded change/tombstone retention while the production V3 write flag remains off. Only D3c4b may activate V3 write authority after an isolated production canary and automatic rollback are proven.

## 11. Analytics rule

Raw pageview events may remain append-only evidence, but public statistics must read bounded/materialized aggregates when freshness is proven. If aggregate freshness cannot be proven, fall back safely; never return partial aggregates as complete. Normal public stats reads must not require scanning the entire raw event history.

The current materialized analytics implementation is an intermediate read model, not the final bounded public stats architecture: its raw-event dependency has been removed from normal reads, but rolling/referrer/device UV and paper-open conversion still aggregate over the growing visitor-state table. Until a background snapshot/rolling aggregate cutover is proven, analytics remains P2 incomplete.

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

1. **P0 — bounded frontend results: COMPLETE.** Browser DOM is a fixed responsive result window (24 desktop / 2 mobile); the initial Hot network payload is also bounded through the hash-bound Hot-head object instead of downloading the complete rolling-three-month snapshot. The static Archive compatibility path fails closed before >1000-result truncation or >36 monthly-segment fanout. Cursor-based indexed paging remains the preferred path for broad historical discovery.
2. **P0 — bounded fallback: COMPLETE.** Deployed architecture failures use verified Hot state rather than reloading all history. The complete Hot fallback object is compatibility-only and is not a normal first-paint dependency.
3. **P1 — indexed all-time search: PRODUCTION ACTIVE.** The dedicated D1 read path is live behind static generation/revision authority. Production canary verified the current 826-card generation, cursor paging, current catalog identity and safe rollback; generation handoff and compatibility cases still fall back to bounded static reads.
4. **P1 — user-library D3c: ROLLOUT CONTROL READY, NORMAL USERS 0%.** D3c1/D3c2 are production-proven; D3c3 performs the V3-first frontend read cutover; D3c4a installs bounded dirty-key mutations and compatibility mirroring; D3c4b production canary passed with zero-residue cleanup; D3c4c provides deterministic percentage rollout plus a read-only preflight status for parity, authority-head and compatibility-head health. Production normal-user rollout remains 0 bp. Production preflight evidence on 2026-10-07 passed at 0 bp with 4 legacy-authoritative users, 4 V3 heads, 0 V3 authority users, complete backfill and zero semantic/revision/authority-head/compatibility-head/stale-legacy mismatches. Current production cohort forecast shows 50/100/500 bp all select zero normal accounts, while 1000 bp first selects one of four accounts (25% of the current real population). Percentage rollout therefore remains at 0 bp until the population is large enough for a meaningful small cohort or a separately authorized real-user pilot is defined. Every Worker promotion must pass the D3c4c rollout preflight: complete backfill, zero semantic/revision/authority-head/compatibility-head/stale-legacy mismatches, and configured fixed seed/canary.
5. **P1 — public media read boundedness: COMPLETE.** Visible media hydration is DOI-window bounded; duplicate TOC detection counts owners only for content hashes present in the requested DOI set rather than grouping the full TOC corpus; public media inventory is restricted to the rendered result window and is explicitly read-only; mutating inventory/repair-row creation requires write authorization.
6. **P2 — summary candidate bounded D1 selection: FOUNDATION COMPLETE, PRODUCTION CUTOVER PENDING.** D2b2 adds a 64-row/page, four-page/256-row maximum indexed selector with exact preferred-DOI lookup and explicit `summary_candidate_bounded_window_exhausted` fail-closed behavior. The legacy/full-set indexed selector remains shadow-only and the production summary-review selector remains on the legacy R2 path until a separate parity/cutover gate proves the bounded selector.
7. **P2 — public analytics bounded snapshot: SHADOW FOUNDATION INSTALLED, CUTOVER PENDING.** D4c adds a singleton public snapshot generated outside the request path, source-race fencing across materialized pageview and paper-open watermarks, 15-minute background refresh, freshness metadata, and deployment parity. Public `/site-stats` still uses D4b materialized reads until a separate cutover proves live snapshot freshness and rollback. The D4d fail-closed snapshot read branch is preinstalled ahead of D4b, but dormant while `SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0`; once enabled it must never fall back to visitor/raw-event aggregation. D4d activation canary and rollback are installed in the sole canonical Worker deployment: activation must prove live snapshot parity/freshness/public routing or automatically redeploy with snapshot reads disabled.
8. **P3 — continue scale audit only where a normal request can still grow with global history.** Backfill/reconciliation/admin maintenance may be cursor-based background work, but no public display, search, media, account or analytics request may regain corpus-wide behavior.

These priorities are scale-safety work. They do not alter the Tampermonkey acquisition workflow in this architecture task.
