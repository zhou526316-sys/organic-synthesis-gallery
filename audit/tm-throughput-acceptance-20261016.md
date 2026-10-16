# Tampermonkey throughput repair — 2026-10-16, Beijing

Approval: user explicitly approved four items: heartbeat isolation, inventory architecture, nonblocking private-PDF transfer, and genuine per-layer browser acceptance.

## Baseline and root causes
- 2026-10-14 6.2.65: 207 queued, 101 distinct publisher DOI visits, 111 attempts, 43 resolved, 43 TOC saved, 2 body figures staged, 11 full-text evidence receipts.
- 2026-10-15 late 6.2.67: 198 queued, 9 distinct visits, 10 attempts, one resolved, zero TOC saved; ~190 unvisited.
- The prior global `publisher_script_missing_3_consecutive` counted repeated failed attempts on the same DOI and unrelated publishers.
- Worker scoped inventory GET filtered **after** downloading and parsing the full stage/report R2 indexes; the ~6.15MB stage object was read on every 80-DOI chunk.
- Live 2026-10-16 08:30 client log was 6.2.68, before current main 6.2.69; it does not certify full-run success/failure.

## This branch and its bounded improvements
1. Count unique DOI heartbeat failures separately per publisher; quarantine one publisher after three different affected DOI, leaving every other publisher running and unvisited DOI unresolved. Real 401/403/429, auth gate and challenge safeguards stay unchanged.
2. After verified publisher PDF download, persist the original bytes + hash in owner-only Tampermonkey local queue. Gallery owner session independently verifies cloud inventory, current entitlement, DOI, content hash and size before private upload. Transfer is allowed concurrently with publisher scraping; local quota pressure retains the prior direct-upload fallback. Deferred PDF is **not** 'stored'.
3. Worker GET inventory verifies R2 HEAD ETag and reuses parsed objects in the current Worker isolate; a per-DOI map is used for subsequent chunks, and stale HEAD/GET generation mismatches cause 503 rather than false negative inventory. The TOC index uses the same mechanism. Indexed-in-memory warm cache **does not** guarantee cross-isolate direct R2 DOI GET, so a persistent per-DOI materialized backend remains a separate unverified optimization.
4. Controller summary separates TOC saved, stage/body figures and their completeness, fulltext evidence, owner PDF stored vs deferred, R2 production primary visual, and **not_browser_verified** for actual frontend rendering.

## Acceptance gate (no false success)
- **Pre-release:** Source syntax, circuit tests (same DOI retry, cross-publisher continuation, 3 distinct DOI quarantine), PDF lease/hash/redirect/401/403/429 tests, worker ETag cache/race tests, source contract and bundled installer build must all pass.
- **Dual domains:** Both canonical installer URLs must read back Bridge 2.2.89 and embedded install 6.2.70; do not infer from a green build alone.
- **Real continuous owner browser:** using current authorized owner Tampermonkey installation, record a full uninterrupted missing-only pass and exported server log. Report queued DOI, distinct visited, attempts, deferred/cooldown/quarantined, unvisited, publisher distribution and live install revision. Target restoring at least the Oct-14 baseline 101 distinct visits when the queue has at least 190 eligible DOI and the owner browser remains available; no universal all-DOI failure after two distinct DOI.
- **Inventory:** report cold and warm per-80-DOI request latencies, `inventoryCacheHits`, `inventoryReadMs`, full/partial/error scope, and actual R2 HEAD/GET counts. The 16-second client deadline is an upper bound, not evidence that each batch completed.
- **Separate capture truth:** count official TOC production receipts, usable main visuals confirmed in D1 media inventory, individual body figures staged and expected/discovered completeness, fulltext `complete` versus `partial`, PDF `stored/already_stored` versus `deferred_upload/failed`, and actual browser card rendering checks. 43 TOC receipts must never be reported as 43 four-layer-complete articles.
- **Fail closed:** absence of owner lease, unverified inventory, true HTTP 401/403/429, index ETag races and corrupt owner PDF bytes must not create completion receipts or bypass publisher authorization.
- **Policy invariants:** 7–9 month archive TOC-only, October 1+ visit bundle, no separate figure/text-only publisher visits, main as unique production baseline, one 08:00 Beijing official literature publication, no evening publication.

## Status
Implementation staged on dedicated GitHub branch, not production readback. No actual uninterrupted owner-browser pass has been confirmed from this branch. Status of the 101-visit recovery target and on-screen render validation remains **PENDING** until a real current-version browser log is collected.
