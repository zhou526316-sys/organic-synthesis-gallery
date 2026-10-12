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
