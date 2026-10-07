# Gallery scale-safety audit — 2026-10-07

Status: current long-form architecture audit baseline.
Scope: normal Gallery/public/API requests and background metadata-discovery paths.
Non-goals: Tampermonkey acquisition logic, literature admission/scope decisions, publisher scraping mechanics.

## Executive result

The original all-history/card/media coupling has been split into bounded surfaces.

This audit found and corrected four additional scale/authority regressions that remained after the Hot/Archive redesign:

1. every public media read still performed a whole-`toc_assets` duplicate-hash aggregation;
2. public media inventory used the whole in-memory paper corpus and could create media-repair rows from an ordinary visitor request;
3. complete all-time DOI membership was reserialized into a hidden DOM JSON node after the architecture reader had already loaded it;
4. the indexed summary-candidate selector still loaded all Evidence and all summary-job rows into Worker memory.

After the D4d/D4e cutover, no known normal public Gallery request in the audited surfaces requires work that grows with the all-time literature corpus or visitor history. Remaining work is compatibility/shadow cutover and cleanup.

## 1. Frontend literature payload

State: **bounded / production active**.

- default landing uses verified Hot only;
- first-paint Hot payload is the hash-bound inline Hot-head;
- desktop DOM window: 24 cards;
- mobile DOM window: 2 cards;
- full Hot compatibility snapshot is not a first-paint dependency;
- Archive discovery uses indexed/cursor or bounded static paths;
- exact Archive DOI remains on-demand;
- all-time membership remains a correctness registry inside the verified reader;
- `gallery-literature-doi-registry` is summary-only schema v2 and never materializes the all-time DOI array into DOM.

Residual accepted cost: complete all-time membership is still downloaded in the background for correctness fencing. It is not duplicated into the page payload.

## 2. Public media reads

State: **bounded / authority separation complete**.

### Visible hydration
The browser sends only visible/near-visible DOI batches.

### Duplicate TOC detection
M1 derives candidate hashes from requested DOI rows and asks D1 for owner counts only for those hashes in fixed chunks. Duplicate correctness remains global for requested hashes; unrelated hashes are not aggregated.

### Inventory
M2 now:
- derives inventory DOI keys only from rendered `#gallery` cards;
- inherits the 24/2 result-window bound;
- sends `readOnly:true`;
- requires Worker write authorization for any non-read-only inventory request.

Tampermonkey staging is retained only for the current rendered result window. Capture/promotion authority is unchanged.

## 3. Search and Archive reads

State: **bounded / production active**.

- D1 metadata/FTS read path is generation-fenced against static content-addressed authority;
- result windows are bounded and cursor-based;
- broad static fallback fails closed above fanout/result limits;
- partial failures are not false zero-results;
- two-character chemistry/reader-count compatibility cases remain bounded fallback cases.

## 4. User library

State: **row architecture proven; normal-user write rollout intentionally 0%**.

- D3c3 V3-first bounded reads are live;
- D3c4a dirty-key V3 mutation and D3b compatibility mirroring exist;
- D3c4b isolated production mutation/head/page/delta/compat/conflict/legacy-fence canary passed;
- cleanup proved root deletion, cascade changes, root count zero and `PRAGMA foreign_key_check` empty;
- D3c4c deterministic rollout, preflight, deployment fail-close and read-only cohort forecast are installed;
- production preflight passed with 4 legacy users, 4 V3 heads, zero mismatches and zero V3 authority users;
- current forecast: 50/100/500 bp select 0 accounts; 1000 bp selects 1/4 accounts, therefore normal-user rollout remains 0 bp.

## 5. Evidence and scheduled handoff

State: **indexed/cursor foundation active**.

- R2 remains byte authority;
- D1 carries bounded metadata;
- backfill state persists cursors;
- Evidence and encrypted handoff backfills do not use fixed page-loop ceilings as correctness boundaries;
- readiness/freshness gates separate shadow from active indexed reads.

## 6. Summary candidate discovery

State: **D2b2 bounded selector installed; production cutover pending**.

D2b2 adds:
- 64 evidence rows/page;
- maximum 4 pages / 256 rows per normal selection;
- job join only for the scanned evidence window;
- exact preferred DOI lookup;
- SQL recent-published aggregate;
- definitive result only when proven;
- HTTP 409 `summary_candidate_bounded_window_exhausted` if the bounded prefix cannot prove absence.

The older full-set D1 selector remains shadow-only. Production daily summary selection remains legacy R2 until a separate cutover proves candidate identity and fail-closed behavior.

## 7. Private PDF

State: **bounded per user/DOI/document**.

- capability lookups are per-user;
- document choice is per DOI with `LIMIT 1`;
- token lookup is exact;
- R2 reads are exact object/range reads;
- capture/import is explicit owner/private workflow.

## 8. Analytics

State: **bounded / production active**.

D4c/D4d/D4e provide a singleton public analytics snapshot, 15-minute background refresh, source/generation/freshness fencing, D4b materialized parity, snapshot-primary public reads, bounded fallback, and no raw-history public fallback.

Final canonical run `37565390491` proved 621 raw/materialized events, 621 global PV, two D4b parity passes, one-attempt D4c exact-generation semantic parity, two consecutive D4d propagation checks, public `readPath=snapshot`, generation `site-pageview-v3-snapshot`, and rollback skipped. Independent public verification reproduced snapshot-enabled health and the snapshot read path.

## 9. Background/admin paths

Fixed limits such as 1000/1200 rows are acceptable only when truncation is explicit or progress is cursor/state based. They must not be treated as proof of global completeness.

## 10. Priority after this audit

1. **Bounded summary-candidate selector parity and production cutover.**
2. **Revisit all-time membership transport only when membership size itself becomes material; do not reintroduce it into DOM.**
3. **Continue periodic searches for public-request queries containing unbounded `COUNT/GROUP BY/list` over historical tables.**
4. **Retire compatibility/shadow paths only after rollback evidence is preserved.**

Hot/Archive lifecycle, media acquisition authority, literature release scope and private-PDF authority are unchanged.
