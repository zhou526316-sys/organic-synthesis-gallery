# 2026-10-16 22:39+ Beijing — owner 6.2.71 real log and approved 6.2.72 remediation

## Evidence

Read-only owner R2 diagnostic via [Actions #38917430976](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38917430976) for the newly uploaded log. Actual user `installRevision=6.2.71`, `uploadedAt=1792161500223` (2026-10-16 14:38:20.223 UTC), controller `2.2.41`, capture protocol `6.2.20`. Owner run began `2026-10-16T07:53:23.790Z` and was still `phase=running` at the snapshot.

| Field | Value |
|---|---:|
| Registry scope | 1186 |
| Jul–Sep historical TOC-only | 851 |
| Oct-1+ new media scope | 329 |
| Excluded by policy | 6 |
| Current missing jobs | 213 |
| Visited distinct DOI | 124 |
| Attempts | 147 |
| Resolved current run | 18 |
| Unresolved | 195 |
| Results (success/partial/failed attempts) | 7/27/113 |
| Media TOC receipt attempts | 19 |
| Figure-stage receipts | 69 |
| Fulltext evidence receipt attempts | 20 |
| Owner PDF inventory | read_failed (255 ready, 1 pending, 13 missing, 911 unknown) |

The stage index was a valid R2 JSON object, 6,377,138 bytes / 4,026 items. Media chunk #2 and TOC inventory chunks #3–7 reported deadline `controller_native_timeout_16000ms`. Real per-publisher reports included many `bound_publisher_heartbeat_missing` and article-level `toc=not_found`; most `toc=not_found;figures=not_requested;evidence=not_requested` are Jul–Sep TOC-only visits and must never be represented as full-media acquisition failures or fabricated success.

The new 6.2.71 long-run opened more than the previous Oct14 101 DOI visits; the earlier global-three-tries stop is gone. However 18 of 213 current missing jobs resolved is NOT satisfactory TOC completeness.

## Approved scope fix PR #728

- The owner controller was refreshing all multi-MB media/TOC/figure indexes, text and owner PDF inventory once each DOI/60s. New `INVENTORY_FULL_REFRESH_MIN_MS = 20min` coalesces this repeated full-corpus scan without changing the initial startup validation, per-request 16-second deadline, receipt checks or end-of-run final reconciliation.
- New capture jobs with `addedDate>=2026-10-01` and legitimate October publication policy go before 7–9 month `toc_only` jobs both when building the initial queue and while sorting pending work; date/journal ranking and first-pass-before-retry fairness within those cohorts are unchanged. Historical tasks are retained and remain searchable.
- Owner D1 inventory already permits 80 DOI per request. Batch size increases from 12 to 40 (329 DOI from 28 to 9 calls). The existing transient subdivide-on-error/401/403/429 no-retry contract stays.
- A 16s exhausted media inventory transport cannot be immediately retried for another identical 16s timeout. Preserve the last verified snapshot and record an explicit partial-inventory error rather than convert unknown to missing.
- Bridge `2.2.91` / install `6.2.72`. Capture protocol `6.2.20` / controller `2.2.41` unchanged.
- Real `toc=not_found` source identification is an independent unresolved publisher-adapter issue. Never relabel historical Figure 1 as publisher official TOC, never fabricate image or PDF receipts, and never bypass a real publisher access denial.

## Acceptance (requires fresh authorized user browser after deploy)

Check initial and repeated inventory request counts, inventory errors (including sublayer), DOI scope order (October genuinely new before historical), distinct DOI visits, staged figures vs local pending images, text evidence level, owner PDF cloud-stored vs locally queued, publisher heartbeat rates, and genuine production card render. Green CI or valid R2 stage objects alone does not prove 4-layer completion.

No standalone figure/text-only visits, no change to sole 08:00 Beijing literature publication and no paid PDF service.
