# Gallery architecture — current authoritative contract

Status: current architecture policy, updated 2026-10-07 Asia/Shanghai.

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

Raw pageview events may remain append-only evidence, but public statistics must read bounded/materialized aggregates when freshness is proven. If aggregate freshness cannot be proven, fall back safely; never return partial aggregates as complete. Normal public stats reads must not require scanning the entire raw event history. Public site-stats must never fall back to raw history or visitor-table-wide recomputation when a materialized watermark is momentarily behind; it must use a bounded fresh snapshot fallback or return explicit bounded-unavailable status. Snapshot-source eligibility is based on internally coherent materialized watermarks and may lag the raw tail within the explicit snapshot freshness budget; the historical backfill complete bit is required for strict materialized reads, not for a fenced snapshot.

The bounded public analytics snapshot is production-active. Heavy visitor-state aggregation is generated outside the public request path and fenced by source/generation/freshness evidence. Normal public `site-stats` reads the singleton snapshot; D4b materialized analytics remains a background/admin correctness and parity source. Disabling primary snapshot reads may serve only a fresh snapshot fallback or explicit bounded-unavailable response; it never enables public materialized aggregation. Public requests never fall back to raw history or visitor-table-wide recomputation.

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
6. **P2 — summary candidate bounded D1 selection: DORMANT FOUNDATION, NO CURRENT DAILY-SUMMARY CUTOVER.** D2b2 adds a 64-row/page, four-page/256-row maximum indexed selector with exact preferred-DOI lookup and explicit `summary_candidate_bounded_window_exhausted` fail-closed behavior. The old summary-review cycle is not imported or called by the active Worker; CI forbids reintroducing that call. Production retains `SUMMARY_REVIEW_ENABLED=0`, `SUMMARY_MODE=scheduled_chatgpt_daily_no_api` and publication time `12:00 Asia/Shanghai`. Current daily summaries do not use this selector. Its full-set shadow comparison has not proven bounded-window parity, nonempty eligible selection or a production cutover. Any future activation is a separate decision and requires new evidence; architecture completion does not authorize enabling the retired review chain.
7. **P1 — public analytics bounded snapshot: PRODUCTION ACTIVE, INCLUDING D4f HARDENING.** D4c/D4d/D4e are live. Canonical run `37565390491` proved D4b source parity, exact-generation D4c semantic parity, two consecutive D4d propagation checks, unauthenticated public `readPath=snapshot`, generation `site-pageview-v3-snapshot`, health read-enabled=true, and rollback skipped. Raw-history public fallback is removed and backfill counter drift is diagnostic-only.
8. **P3 — continue scale audit only where a normal request can still grow with global history.** Backfill/reconciliation/admin maintenance may be cursor-based background work, but no public display, search, media, account or analytics request may regain corpus-wide behavior.

These priorities are scale-safety work. They do not alter the Tampermonkey acquisition workflow in this architecture task.




Site-analytics backfill scanned/materialized counters are operational diagnostics, not public-read authority; realtime correctness is fenced by materialized event watermark, cursor, global timestamp, error state and snapshot generation.

Production analytics activation proof (2026-10-07): D4b `ok=true` with 621 raw/materialized events, 621 global PV and two stable parity passes; D4c `ok=true` with exact-generation snapshot parity, `same=true`, `sourceStable=true`, and `generationFenced=true`; D4d `ok=true`, `activationRequested=true`, `readPathActive=true`, public `readPath=snapshot`, generation `site-pageview-v3-snapshot`, rollback skipped.


## D4f source-integrity and rollback hardening — 2026-10-07

Backfill maintenance counters remain diagnostic-only. Source initialization and watermark ordering are bounded readiness checks; actual raw-prefix/ledger membership and global-PV consistency are verified only during background snapshot generation. Non-dense event IDs are valid. An inconsistent or over-age pending source cannot overwrite the last good snapshot. Pending-source age and snapshot age share the same freshness budget, so regeneration cannot renew an already aging source for an extra full TTL. The scheduled worker catches up strict-readiness lag in the existing maximum four 100-event pages before refresh.

Every public analytics read, including rollback with primary snapshot reads disabled, reads at most one singleton snapshot row. No public flag combination invokes materialized visitor aggregation or raw-history aggregation. The canonical deployment runs behavioral analytics and deployment-contract regressions before any remote mutation, and rollback verification rejects both legacy-raw/v1 and materialized/v2 public reads.

D4f production acceptance: canonical run `37567501285` on commit `c8b0bab821fec51292d917dbcdc60707b2e3de05` passed the 39-test pre-deployment gate, Worker dry-run/deployment, D4b/D4c/D4d proof and V3 rollout preflight; rollback was skipped. Public stats served HTTP 200 / `snapshot` / `site-pageview-v3-snapshot` at the exact proven generation. See `audit/architecture/d4f-20261007-production.json`. The separate Pages browser API mirror reported Cloudflare authentication failure (run `37567501290`, code 10000). The subsequent deployment-boundary review retired both automatic writers to that legacy Pages project and retained manual read-only inspection; see `architecture/LEGACY-PAGES-BOUNDARY.md`.


## Legacy Pages ownership — 2026-10-07

GitHub Pages owns the public frontend and the canonical Worker workflow owns the public API. The historical static Pages and API Pages workflows no longer deploy to the shared `organic-synthesis-gallery-public` project. Both are manual-only callers of one read-only inspector; the remote project and compatibility addresses remain retained. A readable project is not permission or configuration proof for deployment. Authentication failures remain explicit and cannot trigger automatic restoration. The Worker deployment authority regression protects this boundary. See `architecture/LEGACY-PAGES-BOUNDARY.md` for caller evidence and acceptance limits.
