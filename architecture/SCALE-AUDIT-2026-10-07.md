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

After the fixes, the highest-priority normal public-read path still known to grow materially with historical/user volume is public site analytics.

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

State: **P2 incomplete — next architecture target**.

Good:
- raw pageviews are append-only evidence;
- realtime materialization and persisted backfill cursor exist;
- global/daily PV/UV are materialized;
- readiness is watermark/freshness fenced;
- active public reads do not rescan raw pageviews.

Remaining scale leak in `materializedSiteAnalyticsStats()`:
- all-time visitors-with-paper-open counts growing global visitor rows;
- today's paper-open count scans today's visitor rows;
- 30-day referrer UV groups visitor rows in the rolling window;
- 30-day device UV does the same.

Those are derived-state scans rather than raw-event scans, but public request cost still grows with visitor population.

### Required next design
Create a background-refreshed public analytics snapshot/rolling aggregate:
1. snapshot generation runs outside the public request path;
2. snapshot stores the exact public aggregates/response;
3. snapshot includes `generatedAt`, source watermark and freshness state;
4. public stats reads one bounded snapshot plus at most fixed daily rows;
5. stale/missing snapshot fails closed or serves explicitly stale last-good data — never rescans visitor history inside the public request;
6. current materialized response remains parity oracle until snapshot output matches exactly;
7. cutover is separately activatable/reversible.

## 9. Background/admin paths

Fixed limits such as 1000/1200 rows are acceptable only when truncation is explicit or progress is cursor/state based. They must not be treated as proof of global completeness.

## 10. Priority after this audit

1. **Analytics public snapshot/rolling aggregate.**
2. **Bounded summary-candidate selector parity and production cutover.**
3. **Revisit all-time membership transport only when membership size itself becomes material; do not reintroduce it into DOM.**
4. **Continue periodic search for public-request queries containing unbounded `COUNT/GROUP BY/list` over historical tables.**

Hot/Archive lifecycle, media acquisition authority, literature release scope and private-PDF authority are unchanged.
