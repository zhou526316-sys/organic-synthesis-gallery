# Historical fulltext v0.2.10: 14/573 and 0 new bodies, read-only incident triage

- Beijing checked at 2026-10-16 09:23:33 +08:00
- User evidence: screenshot `image(20261016-011813).png` received in chat, displaying 历史正文 · 独立补抓, `已暂停`, `已尝试 14/573`, `本机新增0 / 已存在69`, `许可待核实3 / 其他受阻11`, retained review tabs 2/2, last DOI `10.1126/sciadv.aeh2073`, stage `publisher_wait`, last error `出版社脚本未启动或未确认`, pause button `准备暂停…`, diagnostic outbox 3 pending.
- Feedback decision gate: project PROJECT_RULES.md requires **verify first and present options for user selection**. This audit performs no actual capture/parser/rights/UI source changes and does not claim the user's local browser is remotely controlled.

## What the screenshot proves, and does not prove

1. The one-shot publication-bound manifest read and DOI selection completed for this browser session; it did not remain at the prior `0/0` startup error. `573` is this run's selected publisher-page workload, **not** the entire site DOI membership. `batchStart(false)` invokes `batchLoadCanonicalCatalog()` with date < 2026-10-01 and `batchSelectCandidates`, which excludes successful packets and cooldown/blocked cases. The separate `全库开放正文补抓（本机）` loads all formal DOI for legitimate official OA source scanning.
2. `14 attempted; saved 0; licence pending 3; other failed 11` is a user-browser batch counter snapshot; 69 previous local packets are stored `packets` keys, **not verified complete manuscripts or 69 public-indexed articles**.
3. `已暂停` is terminal/paused batch display, while the button text `准备暂停…` is a stale presentation error: `batchStart` finally writes the paused state with `batchStatusWrite(...)` BEFORE executing `batchPaused=false` without a fresh render. Additionally it keeps the previous DOI stage and lastError, so `publisher_wait` can linger after the run has stopped. This is a **confirmed UI state-order defect**, not proof an ongoing network wait.
4. The two retained article tabs are by design DOI-verified ambiguous-licence pages, not the full set of failed articles. `待发3` means 3 metadata-only outbox events lack server acknowledgment, not 3 full article files.
   
## New owner-only production diagnostic evidence

- Triggered existing read-only owner workflow through `audit/automation-triggers/historical-text-diagnostic-read.json`, commit `f5fc559a9a2cf4367c1ccc667701e7d3d451624c`.
- [Workflow #38834544404](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38834544404), job `116760604826`, **success**; last 200 events, 147 distinct final attempts across scripts; zero DOI lists, article prose, browser URLs or credentials in output; `rawEventsReleased=0`, `bodyReleased=false`.
- For script `0.2.10`: 15 metadata events correspond to **12 distinct terminal attempts**: `publisher_script_not_confirmed=5`, `timeout=4`, `license_pending_load=3`, **`saved_local=0`**. Twelve reported finals are a **partial private-server view** and must not be equated to the user's `14` attempted count while outbox 3 pending.
- Cross-tab `byPublisherAndVersion` in that aggregation includes 6 ACS, 4 Nature, 2 Elsevier terminal attempts for 0.2.10; the particular Science Advances final diagnostic from screenshot was not among the acknowledged 12 as of this read, so **do not invent its HTTP outcome**.

## Verified code-level defect candidates / separately proven access restrictions

- Source: `public/gallery-historical-text-pilot.user.js` on main `@version 0.2.10`, blob `b0e07ab92f40a6486b8e74007a4c2dcc105a87fe`.
- Despite Tampermonkey `@run-at document-start`, the code captures only `#gallery-historical-job` into sessionStorage at start; actual `batchBoot` and thus `batchWorker` + its first `BATCH_PROGRESS` heartbeat wait until `DOMContentLoaded`. Meanwhile controller `batchAwaitResponse` returns `publisher_script_not_confirmed` after `BATCH_NO_HANDLER_PILOT_MS=10000` without matching progress. Slow publisher DOMContentLoaded or SPA redirect could therefore produce an early **false no-handler** and foreground retry, even when the userscript loaded. **Confirmed hazardous sequence in source, not yet measured browser root cause.** The overall response budget is 24s, publisher-license DOM probing 9.5s.
- Source has publisher-specific routes and a single foreground retry, but no separately authenticated early `document-start` heartbeat. Retry logic makes an unverified script-nonhandler failure automatically replayable only when prior `captureRevision` differs; next ordinary pass may skip the same `v030` failures rather than complete them.
- `10.1126/sciadv.aeh2073` is a genuine July 2026 Science Advances research DOI, with public main-text at `https://pmc.ncbi.nlm.nih.gov/articles/PMC13394482/`. The PMC official article declares **CC BY-NC 4.0** (not unrestricted CC BY). Current historical batch only stores text with article-specific CC BY 3.0/4.0 or CC0. Hence even with a successful publisher script, this specific OA article is **excluded by the current local-only reuse whitelist**. That is a separate scope/legal-design choice, not proof the present `publisher_script_not_confirmed` arose from licence classification.
- The current `packets` store and owner diagnostic token must never be cleared while repairing the browser worker. Private scholarly reading and a public full-text FTS import have different copyright permissions, and Article CC BY-NC does not authorize unrestricted public commercial reuse.
  
## Proposed separate changes **NOT yet implemented**

A. Make an **exact fragment/tab-token-bound early startup receipt** at document-start, before waiting for DOMContentLoaded, distinguishing `userscript_loaded`, `publisher_dom_wait`, `doi_verified`, `rights_pending`, `source_saved`. Keep source DOI identity and authorisation fail-closed, but do not classify slow DOM rendering as extension-not-injected. Observe publisher redirects/interstitials, and preserve one genuine comparison case per publisher; avoid simply raising all timeouts.

B. Correct the paused-state UI: reset `batchPaused` before final UI refresh, clear stale `publisher_wait` on terminal pause, and show distinct `等待出版社` vs `本轮已停止`. Make latest unsent report count & last acknowledged diagnosis readily visible. Never delete local packets or owner token.

C. For all 1151+ DOI, separate metadata/source available, article text verified, licensed local-only research index, and public reusable-body FTS. If the user separately authorizes noncommercial local storage, review CC BY-NC licence terms, attribution and source restrictions, while never auto-publishing restricted text or SI/PDF and never bypassing access controls.

## User action for next evidence

- Do not re-run the same 573-DOI publisher batch blindly until the starting race is resolved, especially since 0.2.10 records may be sticky on subsequent automated runs.
- Keep the two retained uncertain-permission publisher tabs for review; in Gallery click `失败详情` to inspect DOI, stage and whether real HTTP 403/429 was observed, then `立即上传待发诊断` to send the 3 pending metadata receipts. Do not provide access tokens/cookies or copyrighted text in chat.
- After explicit approval for corrective scope, add browser tests for delayed DOMContentLoaded, redirect lost hash, wrong DOI, ACS foreground replay, NS/NC licences and paused UI, update only independent historical-text userscript and tests, and deploy only after regression+Pages live installer readback.

No changes to TOC, body figures, private PDF, SI, public FTS, or the Beijing 08:00 unique literature release slot.
