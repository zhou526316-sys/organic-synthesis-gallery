# Historical archival candidate collection: accelerated bounded recall

Authorized October 12 2026: real 16-journal staging verified, continue towards each journal's founding.
The nightly collector attempts at most 48 journal/date windows and 220 Crossref/OpenAlex requests.
Incomplete source, 429, truncated one-day window or abnormal pagination blocks advancement.
Publisher truncation is split into date leaves and resumable source-verified evidence.
Both scheduled GitHub triggers 23:00/23:09 Beijing share a night key even if delayed past midnight.
Explicit daytime user-approved catchup runs do not suppress the next normal scheduled collection.
Candidate staging cannot write any protected literature data, body figure, PDF or production search.
Archive formal admission requires separate DOI-specific two-pass synthesis scope review and the sole 08:00 slot.
Publication date decides July–September toc_only or pre-July metadata_only media policy.
Candidate metadata may not be counted as reviewed/published; title matching is not sufficient evidence.
Track actual source coverage/rate limits, and slow down if live publisher APIs block.

When the configured source-request budget is reached mid-window **without any publisher failure**,
the collector reports `deferredBudget=true` and exits normally after saving its existing checkpoint.
It never writes or marks a partially enumerated root/leaf as source complete; a future run
retries it from the same cursor. Genuine 429/403/network errors remain blocking failures
and must not be relabeled as a local budget deferral.

## 2026-10-13 year-only RSC OpenAlex single-day pagination

A REAL authorized staging run #38332122394 reproduced a one-day unsplittable OpenAlex January 1, 2026 Chemical Science root: ten pages of 100 returned with more rows, after four nested date splits. Preserve the source failure as incomplete; do not advance the cursor on a truncated source. OpenAlex year-only normalization, not proof of 1-Jan real publication, is the cause. Use only a bounded special 100-page ceiling for **one-day January 1** Chemical Science / Green Chemistry OpenAlex windows; all ordinary sources retain ten pages, and global 220 upstream-call budget remains unchanged. The existing RSC fromCrossref created-date lane and date-uncertain flag remain authoritative. A successful deep page only closes the full source API window; publisher original online date must still be checked per DOI before academic admission. If single-day >100 pages or 220-call budget remains insufficient, fail closed with exact diagnostics (do not convert into a false zero).
