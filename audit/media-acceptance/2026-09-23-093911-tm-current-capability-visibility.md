# Actual capture capability and visibility — read-only acceptance

Context: user asks whether current Tampermonkey capture works and whether progress can be seen in real time. This turn does not change capture code, ordering, media assets, publication gates or the quarantine epoch.
Read workflow: 35807151160, job 107010425564, success.
ReadAt: 2026-09-23T01:39:11.572141Z = 2026-09-23 09:39:11.572 Beijing.
Trigger commit: d8bb77101619d6479c40327d648f40ac573d1bce. The existing acceptance workflow performed R2 GETs only; its raw diagnostic copies were removed afterward.
Direct web reads were inaccessible and container DNS failed. The successful evidence below comes from the existing authorized GitHub Actions read, not those failed requests.

## Recent actual local summary, not the prior window-burst batch

Manual upload receivedAt: 1790127340786 = 2026-09-23 09:35:40.786 Beijing.
Reported capture protocol version: 6.2.20. The compact reader does not emit controllerRevision, so this evidence alone cannot distinguish Bridge 2.2.20 from 2.2.21. Current repository source is the controller-guard build (toc-mainline blob 7a7291854fc2b97fd0034a906dcf415907cc1f8d).
Summary startedAt 2026-09-23T01:27:30.088Z (09:27:30 Beijing). queueTotal=536, selected total=20, queueGeneratedAt=2026-09-23T00:13:43.882Z. This is newer than the historical 512-article release snapshot and must not be reported as a finished 20-paper batch.
Five completed result entries are present at upload: four success, one partial; failed=0 and aborted=0 among these reported completed results. Full-day/whole-library success rates are not inferred.

| DOI | TOC result | Main-text figure stored/discovered | Result | Finished Beijing |
| --- | --- | --- | --- | --- |
| 10.1021/acs.joc.6c01270 | already_available | 4/4 | success | 09:28:42.860 |
| 10.1038/s41467-026-77963-6 | not_found | 5/7 | partial | 09:31:02.850 |
| 10.1021/acs.joc.6c01295 | already_available | 5/5 | success | 09:32:16.862 |
| 10.1038/s41557-026-02258-8 | stored, Figure 1 fallback rather than official TOC | 3/3 | success | 09:32:44.860 |
| 10.1021/acs.joc.6c01302 | already_available | 8/8 | success | 09:34:34.848 |

These five results report 25 main-text storage receipts against 27 discovered semantic figure labels. Discovered labels are not an independently verified publisher-total count; existing objects could be reuploaded or replaced. Do not call this 25 newly unique files or full article-content verification.
At the manual upload snapshot the active job was 10.1038/s44160-026-01155-9; its startup heartbeat was 09:34:39.877. This is historical snapshot state, not proof of the active tab at read time.
The fresh R2 indexes show later activity: official local capture for 10.1021/acs.joc.6c01559, source DOI matching article URL, updated at 09:37:40.556; its staged Scheme 4 updated at 09:38:54.120. Therefore actual server-side storage metadata progressed beyond the manually uploaded summary.

## Storage evidence and quality limits

Current R2 local-capture index: 137 raw rows, 10 post-cutover rows. Staged-figure index: 57 raw rows, 43 post-cutover rows. These include earlier trials and must not be called the result of this single batch.
The reader emitted the latest 16 post-cutover staged assets. They include the new JOC 6c01559 Schemes 1–4, JOC 6c01469 Schemes 1–4, Nature Synthesis s44160-026-01155-9 Figures 1–6, and JOC 6c01302 Schemes 7–8, with article/source URLs, hashes, sizes and dimensions.
Recent local traces include successful figure_stage start/complete pairs with stored=1;published=0. ACS sources include same-DOI Silverchair SVG assets, classified vector or vector_mixed. For example JOC 6c01302 Scheme 3 logged 668x468, 695880 bytes, successful staging. This turn did not redownload these image objects or visually compare them to publisher originals.
Nature Chemistry s41557-026-02258-8 still uses lw685 raster sources (Figure 1 685x453, Figure 2 685x441). Nature Synthesis figures in this read are also 685 pixels wide. Do not claim universally high-resolution capture merely because a receipt says success.
The latest remote report index lags some local completed results and contains a capture_tab_job_mismatch rejection for Nature Communications s41467-026-77963-6, while the local summary has a later partial result for it. Different attempts/snapshots cannot be collapsed into a single global success/failure. No new cross-DOI media pollution conclusion is drawn in this read.
No D1 query, browser-rendering verification, new-image publication or object-byte verification was performed in this turn.

## What can actually be seen now

Current source: public/toc-mainline.user.js, blob 7a7291854fc2b97fd0034a906dcf415907cc1f8d.
controllerRun displays the current paper number/DOI in the Gallery badge at dispatch. The local SUMMARY_KEY is updated after each finished paper; the final batch badge shows TOC/figuresStaged/success/partial/failed. waitForResult changes the badge for auth/challenge waiting, and controller guards show explicit stop reasons.
The menu 查看最近运行摘要 reads a snapshot containing runtimeVersion, summaryIsCurrentVersion, activeJob and summary. A native alert does not continuously refresh itself.
The menu 查看出版社脚本心跳 displays DOI/host/version/state/timestamp, but startup heartbeat alone is not a continuous per-image download meter.
The actual per-image storage and quality evidence is in capture traces/checkpoints. There is no current continuously refreshed panel showing current figure label, in-paper progress, quality, cumulative throughput or estimated remaining time.
finishPairedJob attempts to upload per-paper diagnostic reports; manual local log upload sends the then-current local snapshot. The assistant can read successfully uploaded reports and current R2 indexes on request, not the user's unsent local state or live desktop. No ongoing monitoring task is created in this turn.
Main-text uploadArticleFigure still uses verified R2 staging and returns imported=false, published=false, pending_verified_promotion. Captured/staged figures are not automatically shown on the public card gallery.

Priority gaps remain: latest-missing-TOC/JACS ordering, a nonmodal live progress panel, reliable report acknowledgement, higher-resolution Nature source selection, missing figures, and verified staging-to-publication. None is claimed completed by this read-only turn.
