# Tampermonkey continuity and 2026-10-17 new owner upload — read-only audit

Beijing time: 2026-10-17 19:19 (+08:00). Conversation context: another ChatGPT account's Tampermonkey/VPN Bridge optimizer handoff; user confirms a new owner log has been uploaded.

## Authority and safeguards

- Website: https://gallery.gczhouwld.com/ ; repository: `zhou526316-sys/organic-synthesis-gallery`.
- Read PROJECT_RULES.md and prior Tampermonkey handoff `audit/gpt-responses/2026-10-05/145700-tampermonkey-handoff-rules.md` before any repair.
- User feedback must first be verified and explicitly approved before implementing a particular repair. Do not change capture source, publisher routing, production media/PDF, publishing, or user local storage merely because a log arrived.
- Official TOC/PDF missing layers trigger publisher visits. Oct-1+ Gallery `addedDate` publisher visits bundle body figures, complete text and owner-private PDF; Jul–Sep historical TOC-only tasks do not take body/PDF. PDF private owner lease and valid PDF/DOI/receipt required; PDF failure cannot block media. Never bypass 401/403/429. Official TOC must have publisher evidence, no Figure 1 relabeling. Daily official literature publication solely Beijing 08:00.
- Compare repository source, public served script and real local client; protocol `6.2.20` is not install revision.

## New authentic log

Read via existing R2-only GitHub Actions workflow **Read uploaded Tampermonkey acceptance evidence**:
- Run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028022464
- Owner diagnostic `uploadedAt = 1792235565401` = **2026-10-17 19:12:45.401 Beijing**.
- Diagnostic claims `manual-local-log-upload`, `user_menu`, installRevision **6.2.73**, controllerRevision **2.2.41**, capture-protocol `6.2.20`. This proves this particular real browser reported 6.2.73; it does not independently establish Bridge loader bytes or all publisher script injections.
- Run: BJT **16:24:31.613 → 18:10:10.085** (UTC 08:24:31.613 → 10:10:10.085), terminal `phase=blocked_remaining`; not a partial running snapshot.
- Corpus 1337, historic 978, current-Oct scope 349, excluded 10; candidate count 1327.
- Current job queue 320; **33 distinct publisher DOIs visited; 55 attempts; 3 controller-resolved; 317 unresolved all classified blocked; 287 queued DOIs not visited in this run**. Result rows: 2 success, 1 partial, 52 failed. Count `fullyResolved=3` is a controller bookkeeping count, not proof of 3 four-layer complete documents.
- Verified new attempt receipts: `tocStored=2`, `figuresStaged=1`, `evidenceStored=0`. The two source-backed official TOCs are CCS DOI `10.31635/ccschem.026.202607864` and `10.31635/ccschem.026.202607790`. TOC index had two DOI rows updated since run start; still do not infer website frontend render without browser readback.
- One JACS DOI `10.1021/jacs.6c13913` produced a partial 1/8 figures and private PDF `deferred_upload`, local replay pending, **not** cloud-stored. Cloud private-PDF storage is not proven for this attempt.
- Remaining obligations: 304 TOC, 25 PDF, potentially overlapping; owner inventory 320 ready, 4 failed, 25 missing, 978 historical intentionally unknown/not eligible; owner PDF inventory state verified. Zero inventory errors this run.
- R2 body-stage index: valid JSON, **6,467,727 bytes, 4,080 records**; exceeds obsolete 6-million-character legacy cutoff, not new 32MiB byte limit. Seven stage-index rows updated since run start may involve other controllers, so cannot be credited to this run.

## Complete attempted-outcome breakdown (55 attempts, 33 distinct publisher DOI)

- **28** `bound_publisher_heartbeat_missing` across **18 distinct DOI**: ACS 8, Wiley/Angew 5, RSC 5, Elsevier/Chem 4, CCS 3, Nature 2, Science 1. A controller missing the job-specific heartbeat is not definitive proof a publisher blocks access or that all scripts failed to inject.
- **10** `publisher_article_route_unverified`, all **different Elsevier/Chem DOI**. The verified PII routing safeguard refuses untrusted URLs as designed; real recovery for these 10 not demonstrated. Do not guess PII or bypass.
- **13** authentic loaded article DOMs without DOI-verified official TOC: Science 10, Nature 2, CCS 1; individual Science page traces showed multiple ordinary figures but `metaVisual=0` and no TOC candidates. Missing in those observed sources does not prove none exists in issue/listing publisher records.
- **2** official TOC success (CCS).
- **1** incomplete ACS JACS figure/PDF case.
- **1** `publisher_task_tab_closed`.

Controller source `public/toc-mainline.user.js` at current main 6.2.73:
- `waitManualResult()` can classify missing heartbeat after ~45 seconds without matching job-specific progress; must distinguish permissions, startup, redirects, challenges and controller timing.
- `manualHeartbeatCircuitBreaker()` counts three **distinct DOI per publisher**, then marks remaining pending jobs of that publisher blocked. Unlike old global breaker, this does not stop unrelated publisher groups but greatly reduces actual visit coverage. Confirm cause in Chromium/owner browser instead of blindly disabling protection.
- `coverageStats()` separately tracks attempts, distinct visits, unresolved/blocked and layer receipts. Preserve this semantics.
- `resolvePublisherTaskUrl()` for Elsevier rejects non-publisher/unverified DOI→PII routes; increase observability on Crossref/OpenAlex provider outcomes before considering any route changes.

Earlier owner log was BJT 2026-10-16 22:38, engine 6.2.71, phase running: queue 213, 124 visited, 147 attempts, 18 controller-resolved, with multiple inventory deadlines. Queue/corpus and run phase differ, so do not present 124 vs 33 as an apples-to-apples throughput benchmark. New run gives real positive inventory error reduction, but still fails end-to-end acceptance.

Historical text pilot source at `public/gallery-historical-text-pilot.user.js` is now `@version 0.2.13`. Automatic historical body batches open tabs `{active:false}`; a foreground publisher tab requires explicit single-DOI confirmation. This is the source fix for the Oct-16 two Gallery panels seemingly disappearing after background captures; real user's installed-version/UI outcome has not been independently established. Historical script is DOI and license gated; it writes only locally authorized historical text, not PDF/TOC/figures.

## Proposed next scoped review; NOT implemented

1. **Highest**: one-DOI per-publisher real Chromium/owner-browser injection and heartbeat diagnostics: exact intended/final hostname, @match site grants, actual Tampermonkey injection state, redirect/challenge, tab open/close timestamps, controller job id and publisher heartbeat. Keep publisher quarantine as fault isolation until evidence distinguishes false positives.
2. **Second**: for exact failed Chem DOIs, read DOI-bound Crossref/OpenAlex/publisher PII route provenance and surface provider-specific failure categories; preserve fail-closed 401/403/429/DOI restrictions.
3. **Third**: history Science/Nature official TOC retrieval from official article/issue/listing sources with provenance; maintain honest unavailable state and no Figure 1 fabrication.
4. **Fourth**: nonblocking original-image spool and owner-private PDF replay, with actual cloud stored receipts and frontend render checks, not just local queue counts.

This turn triggered only existing read-only R2 audit via `audit/automation-triggers/tm-acceptance-read.json`, commit `425d0121cc68ac991e66bcfe1e266571742833a7`. No publisher visit, PDF access/download, actual user browser mutation, code repair, merge or production data write. User's explicit approval is still needed for any new unapproved repair scope.
