# 2026-10-15 · Historical body 0.2.9 vs TOC mainline 6.2.67 — evidence-based design review

- Beijing: 2026-10-15T19:35:02+08:00.
- User feedback: **“抓取不需要分页，而且你的抓取能力太差，我建议你先看看toc的抓取脚本”**.
- Approval status: code repair **HOLD** until explicit approval under `PROJECT_RULES.md`. This note is read-only diagnosis, not a modified publisher script or a release.
- Reviewed live `main` GitHub sources:
  - `public/toc-mainline.user.js`: `@version 6.2.67`, source blob `53ea30852eb7b41efda36953559413f258a3337b`.
  - `public/gallery-historical-text-pilot.user.js`: `@version 0.2.9`, source blob `c069b92bff79864576bf667e7dacd36f87498ad8`.
  - `public/toc-demand-live.json`: `generatedAt=2026-10-15T04:50:01.849Z`, 1151 articles / 1151 unique DOI.
  - `cloudflare/scripts/build-live-toc-demand-queue.mjs`; `architecture/queue-membership.mjs`; `docs/full-formal-body-source-coverage.md`.

## 1. The no-paging point is substantively correct for the initial corpus inventory

The TOC mainline downloads a **single, complete, prebuilt** `toc-demand-live.json` registry via `getJson(QUEUE_URL)`. It does not iterate `/api/literature/catalog-view` in 100-DOI pages merely to establish the DOI set before starting. Current real repository artifact contains exactly 1151 distinct DOI: `toc_only=851`, `standard=294`, `metadata_only=6`. It includes pre-July articles and date-unknown entries. Its builder includes all papers in `liveQueue.articles = [...papers.values()]`; the `metadata_only` exclusion is applied to **media inventory and media-gap tasks**, not that master registry. 

By contrast, `batchLoadCanonicalCatalog()` in the historical script fetches release membership, then sequentially fetches `/api/literature/catalog-view` with `SOURCE_PAGE_LIMIT=100` for every member and hard-fails on a 16s `GM_xmlhttpRequest` timeout before attempting a DOI. This is the direct code path compatible with the user's observed 0/0 and timeout. It also delays coverage UI until every HTTP page and IndexedDB operation finishes.

**Recommended correction:** populate the separate local historical body controller from a single generation-bound full DOI manifest, matching full `release-delivery.json` DOI membership. The existing complete TOC registry is a proven **data/transport template** and can supply title/journal/date if the exact DOI set is independently validated for that release. Ensure `catalogId`/revision source-of-truth at subsequent reviewed FTS import. On future registry divergence, create a dedicated full-body manifest, rather than silently excluding `metadata_only` or using stale media queue. No user-facing paging; technical batch scheduling can remain bounded for browser and publisher health. No 20/100 global acquisition cap.

## 2. TOC's browser transport is materially stronger

- `controllerReadMetadataJson` calls native `fetch` first for trusted Gallery metadata/API; falls back to `GM_xmlhttpRequest` only after a real network failure. `inventoryReadMetadataJson` uses staggered hedging for bounded read-only inventory; it records transport-specific failures. Neither approach is simply increasing every wait.
- `getJson(QUEUE_URL)` reads one manifest. `runManualFromHead` warm-starts a previously validated inventory plan from local cache, refreshes asynchronously, provides phased UI, and resumes work after an interrupted run.
- The publisher scheduler uses leasing, DOI-specific success checkpoints, publisher pacing and reason-sensitive cooldowns; the body script has only a simpler lease/result variable and a narrow recheck rule.

## 3. Publisher entry and heartbeat discrepancies are a plausible source of no-handler failures

- TOC `articleUrl` and `resolvePublisherTaskUrl` produce publisher-specific canonical routes: direct ACS landing, Wiley, RSC articleHTML/landing, Nature, Elsevier DOI→PII resolving. `boundPublisherJobUrl` adds `osg-job=...` after route resolution.
- TOC `bindPublisherCaptureJob` records the exact tab jobId in `sessionStorage`, gives DOI metadata and interstitials time to hydrate, and `publisherBoot` emits early heartbeats. It checks job ID/DOI before accepting results and has an ACS foreground retry after a failed background initialization. Three consecutive missing heartbeats stop safely rather than opening the remainder pointlessly.
- The body 0.2.9 script opens predominantly `https://doi.org/<doi>#gallery-historical-job=...` and has an **early return** before emitting its first progress checkpoint if a redirected destination lacks both retained fragment, immediate DOI metadata, and recognized DOI route. Elsevier PII paths are particularly likely not to satisfy the DOI-in-route fallback. This is a code-level hazard, NOT proof of the real user's precise failed route.
- Previous private sample's 57 old ACS no-handler failures and latest small v0.2.9 results motivate targeted browser verification; they do not prove every failure was an extension timing issue.

## 4. Reuse TOC's structured body extraction, not its media/upload authorization

- TOC contains `evidenceArticleRoot`, `collectArticleEvidenceSections`, `collectArticleEvidenceCaptions`, `collectArticleEvidenceTables`, `buildArticleEvidencePacket`; it probes many publisher body roots, uses heading ranges and fallback paragraphs and records `abstract_only/partial/complete` candidates.
- Historical `gather()` uses `main article,article,main,[role="main"]` and primarily direct `h2/h3/h4/p` nodes; template-specific content and nested paragraphs can be under-extracted.
- TOC evidence writes to a separate existing API and marks `textProcessingPolicy:'unknown'`; **this is not a public fulltext copyright grant**. Reuse DOM parsing and reliable page routing, but keep the historical local text storage / article-level permissions and reviewed public FTS import as separate explicit gates.
- TOC's `complete` flag is a structural heuristic, not independent evidence of full scientific text. Use structure/figure/table checks, source hashes, and partial-to-complete upgrade logic for accurate local corpus coverage.

## 5. Proposed acceptance tests before any deployment

1. One validated complete registry fetch at 1151+ DOI, including historical `metadata_only`, undated and October+; compare **sets**, not merely counts, against the official release. No `/catalog-view` pagination prerequisite; no 20/100 global total cap.
2. Browser heartbeat/control contract: simulated ACS landing/redirect, ACS background initialization failure followed by exactly one foreground retry; Nature delayed DOI/license; Wiley dynamic hydration; Elsevier PII route; RSC articleHTML. Do not accept a wrong DOI, an unrelated tab, or a login/challenge page.
3. All DOI selected once into a persisted, resumable local task ledger; attempted/current/success/partial/license unknown/access blocked/never started counts update without waiting for a separate full-corpus inventory.
4. No duplicate TOC/image/PDF/SI tasks or changes to `osg-toc-v6:` state, no new publication slot, and no public upload of unreviewed/publisher-private text.
5. Only after independent verified rights + source hash + current catalogId/revision can an existing section be joined to reviewed public FTS. `0/0` should be reserved for a genuinely empty selected set, not for a catalog fetch error.

**Decision gate:** user should explicitly approve a separate historical fulltext architecture repair based on TOC controller transport, publication-bound one-shot manifest, publisher route/bind/heartbeat, and structured science parser. The TOC mainline itself remains unchanged.
