# Historical text 0.2.9 — postrelease read-only browser evidence and next acceptance gate

- Beijing date: 2026-10-15.
- Scope: existing user-approved historical text acquisition and licensing diagnosis. This entry is **read-only diagnosis** and owner-only aggregate instrumentation. It does not authorize or implement a further publisher capture/rights change.
- Production baseline: `main`; production 0.2.9 script installer was independently deployed/read back in `2026-10-15-historical-text-v029-live-release-and-diagnostic-acceptance.md`.
- Current acceptance: production script/deployment and synthetic Chromium pass. The owner's real Edge/Chrome session has **not** yet produced identifiable 0.2.9 receipts.

## Fresh private aggregation (actual, not synthetic)

Owner-only existing job `116189073156` within run [#38663212945](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38663212945) was safely rerun, yielding successful job `116194050226`. This reused the same read-only D1 aggregation. The read-only script retains only coarse counts; zero DOI, article text, credentials, raw events, or publisher content were released.

- Events: 200 newest, two pages; more events exist.
- Independent job/DOI attempts: **133**, 133 final results, zero checkpoint-only, zero duplicate finals.
- `byVersion`: **0.2.8 = 200 events**, **0.2.9 = 0 events**. All 200 events have occurredAt date 2026-10-14.
- By publisher for the 133 attempts: ACS **62**, Wiley **30**, Nature **24**, RSC **14**, Science **3** (sum 133).
- By terminal reason: `publisher_script_not_confirmed` **62**; `license_not_verified` **41**; `page_http_error` **21**; `body_missing` **6**; `timeout` **2**; `saved_local` **1** (sum 133).
- Actual observed response statuses: HTTP 200 **48**, HTTP 403 **21**, unknown **64**. Unknown HTTP statuses **must not** be classified as publisher denials or inferred 403.
- No real-user 0.2.9 capture-rate improvement can be established from this window.

## Verified source-level limitations (not yet verified causal explanations)

1. `public/gallery-historical-text-pilot.user.js` `batchWorker` has an early-return guard when DOI metadata, surviving `#gallery-historical-job` fragment, and recognized publisher DOI path are **all absent at invocation time**. If a publisher's client-side article DOI metadata appears only after that moment and its route is not one of the recognized canonical paths, the worker exits without a progress receipt. This is a **code-level risk**, **not yet proof** that it caused the 62 observed failures. A publisher/terminal-reason cross-tab and controlled browser reproduction are required before altering the guard.
2. Existing `batchRetryAllowed` deliberately freezes previous `publisher_script_not_confirmed` attempts unless manually retried. The current “出版社回执核验（最多8篇）” is the safe manual diagnostic sample. It does not limit the total eligible DOI catalogue.
3. The publisher-tab batch intentionally selects DOI with verified first-online dates earlier than 2026-10-01; official Europe PMC OA scanning includes **all** formally published DOI including October and date-unverified entries. Therefore “full DOI source coverage” is not the same as “complete science text obtained for each DOI”.
4. The Europe PMC OA selector treats `oa_metadata_doi_missing`, `oa_pmc_missing`, `oa_license_unknown`, and some incomplete-science outcomes as stable for unchanged `sourceRevision`, without a time-based refresh. An article added to OA sources later can be missed until a code/catalog revision. This is a confirmed selection-policy limitation, not evidence that any named DOI was omitted.
5. Both paths skip DOI with **any** saved local packet, even when its `bodyCompleteness` is only `partial`. Existing local packet counts cannot be equated to genuinely complete main-text coverage without separate completeness auditing.
6. The independent public FTS pipeline is not equivalent to locally acquired packets. Last independently documented verified D1 index was one reviewed DOI / six sections with public reading disabled; this run neither changes nor rechecks the FTS count.

## Safe follow-up now

The change in the accompanying PR touches **only** `scripts/audit-historical-text-diagnostics.mjs` and its strictly owner-only GitHub Actions audit workflow:

- Adds `byPublisherAndReason`, `byPublisherAndHttpStatus`, `byPublisherAndVersion` to the aggregate-only summary.
- Checks that each cross-tab totals exactly the number of independently counted attempts and that the diagnostic output contains no released raw events/body.
- Reads **at most 200 metadata events** from the existing owner-only endpoint, adds no publisher visit or publication tasks, uploads no DOI/body/PDF/image/SI, and does not modify the Tampermonkey installer.
- A new authenticated browser pilot should be captured **after** Tampermonkey has been updated in the actual Edge/Chrome profile to 0.2.9 and Gallery refreshed. The primary cross-publisher pilot (12 DOI) tests licensing; the no-handler 8-DOI pilot tests reachability. Both are samples, not a 20-DOI cap.

## Approval boundary for any further capture repair

Before another userscript version is proposed, present exact publisher × failure-reason counts and if possible a reproducible real-user page where DOI metadata arrives after initial handler invocation. Suggested separate corrective items for explicit user approval: route/redirect-safe worker handshake while retaining DOI identity checks; time-bounded OA negative-source revalidation; safe upgrading of partial local packets. No authentication bypass, negative license inference, public upload or media-controller changes are authorized by this diagnostic-only PR.
