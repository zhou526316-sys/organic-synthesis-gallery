# Response synchronization — Tampermonkey handoff and new 2026-10-17 owner log

Beijing: 2026-10-17 19:20 (+08:00).
Context: User requested resuming Tampermonkey optimization with all recoverable historical context, then reiterated “有新的日志”.

## User-visible response (content consolidated)

I will recover past Tampermonkey optimization decisions from GitHub and read the most recent real R2 browser log; I will not restart scraping or change production code simply on receipt of a new log.

Current source baseline (source only, not an assertion about all browsers): VPN Bridge 2.2.92, TOC userscript 6.2.73, historical body text pilot 0.2.13, controller 2.2.41. The prior real browser log from Oct 16 22:38 BJT was still 6.2.71; the Oct 17 fixes focused on indexed reads, TOC CAS, historical source priority and DOI-safe Chem routing.

Read-only R2 acceptance workflow:
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028022464

New **real log confirmed**: uploaded BJT 2026-10-17 19:12:45.401, local installRevision **6.2.73**, controller **2.2.41**, capture protocol **6.2.20**. This actual browser run started 16:24:31, ended 18:10:10, terminal phase **blocked_remaining**; not an in-progress snapshot.

Queue 320 DOI; actual distinct publisher DOI visits 33; attempts 55; controller-resolved 3 (0.94%), unresolved 317; results 2 success, 1 partial, 52 failed. There were **287 queued DOI not actually visited**. Captured outputs in attempt accounting: 2 official TOCs, 1 figure staged, 0 fulltext evidence saved. Queue obligations still include 304 TOC and 25 PDF, overlapping. Owner inventory verified 320 ready, 4 failed, 25 missing, with 978 historical PDF entries intentionally unknown/ineligible. New inventory read errors 0; stage index valid JSON 6,467,727 B / 4,080 rows.

Attempt reason chart:
- 28 missing job-specific publisher heartbeats across 18 distinct DOI and multiple publishers: ACS 8, Wiley/Angew 5, RSC 5, Elsevier/Chem 4, CCS 3, Nature 2, Science 1.
- 13 `toc=not_found` in inspected sources (Science 10, Nature 2, CCS 1); this is not proof no official publisher graphic exists elsewhere, and Figure 1 must not be fabricated as official TOC.
- 10 Elsevier/Chem DOI route unverified, fail-closed.
- 2 source-backed official CCS TOC successes, DOI 10.31635/ccschem.026.202607864 and 10.31635/ccschem.026.202607790.
- 1 partial JACS 1/8 figures, PDF locally deferred but **not** cloud-stored; 1 publisher tab closed.

Confirmed code fact: after 3 **distinct DOI** heartbeat misses in one publisher, controller isolates that publisher and classifies remaining items blocked. It no longer falsely stops all publishers, but that can leave most queue DOI unvisited. A missing heartbeat does not by itself establish blocked publisher access, missing userscript permission, or article-source failure. Check actual script injection, target vs final URL, Edge user script/site grants, tab transition and job heartbeats. Chem failures require verifying same-DOI PII routing/provider outcomes, not guessing destination. Science/Nature TOC must have publisher provenance. No blanket timeout increase or unverified Figure 1 fallback.

Historical script 0.2.13 now confines foreground publisher navigation to explicit manual single-DOI retry; background automatic batches no longer steal focus in source. Browser installed historical version not yet independently established.

Persisted durable audit:
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/tampermonkey/2026-10-17-owner-v6273-new-upload-analysis.md

Suggested priority is (1) heartbeat/injection/route outcome tracing on real browser, (2) Chem exact DOI-to-PII evidence and safe routing, (3) Science/Nature official TOC source adapter audit, (4) verify cloud image/PDF outbox receipts and frontend. Per PROJECT_RULES.md, the new specific repair scope awaits user decision. No code/production/PDF changes were performed. This chat cannot fully import the other account's private memory; Git repository records are the persistent shared handoff. ChatGPT saved cross-chat memory was not written in this conversation and a new conversation would be needed for a new explicit memory save request.

## Related commits

- Read-only R2 audit trigger: 425d0121cc68ac991e66bcfe1e266571742833a7
- Durable Tampermonkey handoff audit: 974a768ffabd098454b2f995df6ed06508f6dd28
