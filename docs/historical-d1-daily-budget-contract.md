# Gallery historical archive: Cloudflare D1 daily-budget contract

Adopted under the user's 2026-10-13 historical-backfill authorization and
explicit instruction to preserve that day's D1 quota.

## Actual daily accounting (never guess current balance)

Cloudflare Workers Free D1 as documented October 2026:
- Rows read: **5,000,000/day**.
- Rows written: **100,000/day**.
- Daily reset at **00:00 UTC = 08:00 Asia/Shanghai**.
- Since 2026-09-01, D1 rejects requests after the Free daily cap until reset.
- Actual plan and day-to-date usage are **unknown unless checked in the
  owner's Cloudflare Billing > Billable Usage or D1 > Metrics**, or using the
  authenticated GraphQL metrics endpoint. Number of API calls is NOT number
  of rows read; a single unindexed query can scan many rows.

Official docs:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- https://developers.cloudflare.com/d1/observability/metrics-analytics/

## Hard isolation

Historical 16-journal Crossref/OpenAlex discovery, source JSON, publisher-issue
citation reconciliation, DOI deduplication, academic review triage and its
balanced reviewer-worklist generation must run in GitHub on
\`staging/historical-archive-nightly\` without Cloudflare D1 queries/writes.
No scan of the 50k-DOI staging history is allowed through the public D1 API.

Only the existing Beijing 08:00 fixed writer may add validated historical DOI
to the production catalog; prospective daily/Hot/WeChat new-paper data and
pre-July metadata-only/July-Sep toc-only media rules remain untouched.

## Bounded, optional real DOI search acceptance

The read-only \`.github/workflows/historical-archive-live-acceptance.yml\`:
- Runs contract tests on PR/push with **zero live D1 operations**.
- Only a successful main catalog-index sync may attempt an automatic live D1
  readback; explicit manual \`force_d1_readback=true\` may override.
- Uses the authoritative release slot from committed Git, **not** local wall
  clock, to create a reservation key. GitHub cache restores a prior reservation
  or saves the FIRST attempt before any API/D1 request. Per-job concurrency
  serializes cache reservation.
- For a given Beijing 08:00 release date, later automatic catalog syncs skip
  readback even if the original attempt failed. Manual retry must be deliberate;
  an ordinary repeated 08:00 release or night-time source scrape does not grant
  permission for unbounded D1 traffic.
- A single actual readback has **at most 16 catalog API calls** and **at most
  3 paginated requests per historical publication day**. If it cannot verify
  every required DOI within budget, mark \`pending\` / fail closed: do NOT report
  a complete Archive/D1 acceptance.
- GitHub cache and a query-count cap are **best-effort safety measures**;
  they are not an account-wide row-read quota oracle. Cloudflare account-level
  D1 usage still needs authenticated accounting.

When the D1 Free quota is near/at exhaustion, leave candidate discovery and
scientific review on GitHub. Do not auto-repeat production acceptance, force
a release, upgrade the account, or perform a full D1 table scan to "verify"
historical completeness. Preserve normal reader/login/search performance.
