# Real Bridge 2.2.22 automatic reports have arrived

Task: user asks whether new reports have now arrived; verify actual stored diagnostics rather than deployment tests or old manual uploads.
Read started: 2026-09-23T02:36:03.657671Z; completed: 2026-09-23T02:36:08.102105Z (10:36:08 Beijing).
Evidence: workflow 35811000350, job 107022330354, success; source commit 4706b0650e3d8f1c62399c925f93df4af89f5773.
Sanitized artifact: 10729133790, tm-auto-report-receipts; reported archive SHA256 007275b9108cab46c8423b4c537999218c499509693c10f152b1bde612af5d35. Authoritative job log was read. Archive was not independently downloaded in this turn.

## What was actually received

Authenticated, read-only R2 GET retrieved the report index containing 122 DOI entries and detailed recent report objects for the latest five DOI (up to four retained attempts per DOI). The read returned no top-level or detailed-object errors. Reads were sequential/parallel within one bounded snapshot, not atomic.
11 DOI entries currently have latest candidateSource beginning auto_: 10 final results and 1 interim failure checkpoint. The 10 latest automatic final results classify as 1 success, 8 partial and 1 failed. These are the latest stored report states for this observed subset, not a global success rate or a completed whole batch.
Retrieved diagnostic_context events explicitly identify controllerRevision=2.2.22, captureVersion=6.2.20, jobId, eventId, pageDois and retryCount. candidateSource distinguishes auto_failure_checkpoint from auto_final_result. This confirms new automatic evidence delivery, not merely a manual local upload.
The separately read manual snapshot was uploaded at 1790130716023 (10:31:56.023 Beijing), with controllerRevision 2.2.22. It is separate and older than the newest automatic reports and was not substituted for them.

## Concrete receipt times and results (Beijing 2026-09-23)

- 10:36:00.125: DOI 10.1021/acs.orglett.6c03636, auto_failure_checkpoint, status progress. Task began 10:34:59.206. The checkpoint context is timestamped 10:35:55.869, giving an observed client-to-server timestamp difference of 4.256 seconds. This is one sample, subject to client clock accuracy, not a latency guarantee. It contains specific Scheme 1/2/3 transport, format and HTTP 403 candidate failures. No final result had arrived in the captured index for this task.
- 10:35:00.144: DOI 10.1021/acs.orglett.6c03418, auto_final_result, success, toc=already_available, figures=9/9, published=0. Finished at 10:34:54.885; timestamp difference to receipt 5.259 seconds. The preceding candidate failures did not imply final article failure.
- 10:33:10.150: DOI 10.1021/acs.orglett.6c03340, auto_final_result, partial, toc=already_available, figures=5/7, published=0. Finished 10:33:02.860.
- 10:31:39.990: DOI 10.1002/anie.9519061, auto_final_result, failed, toc=not_found, figures=0/0, published=0. Finished 10:31:35.865.
- 10:31:11.778: DOI 10.1021/acs.orglett.6c03335, auto_final_result, partial, toc=already_available, figures=2/4, published=0. Finished 10:31:02.779.

The other six latest automatic DOI states: OL 6c03511 partial 1/4, OL 6c03499 partial 4/6 with toc stored, OL 6c03473 partial 3/4 with toc failed, OL 6c03459 partial 4/5, OL 6c03434 partial 0/3 with toc stored, OL 6c03394 partial 2/4.
Figure fractions mean stored/discovered labels as reported by the script, not independently verified total figures on the publisher site. This turn did not read image bytes, stage index or the published gallery manifest. No claim is made about new unique assets, pixel correctness or live card rendering.

## Newly actionable failure evidence

1. Storage upload failures, highest priority: OL 6c03340 Scheme 5 failed at 10:33:02.850, stage=figure_stage, httpStatus=503, message label=Scheme 5;cause=server_http_5xx;upload_http_503. OL 6c03335 Figure 1 failed at 10:30:37.854 with the same stage and HTTP status. The failure occurred after candidate acquisition reached the stage-upload step; it must not be called publisher image absence or image-download 403. The captured error lacks the specific backend body, so the underlying Worker/infrastructure/quota cause is not established. Next bounded investigation should correlate these job/timestamps to stage-handler response details and test a bounded upload-only retry preserving the already acquired image, rather than redownloading the entire article or loosening identity guards.

2. ACS acquisition inefficiency: /view-large/figure candidates often returned 403 or response bytes rejected as application/octet-stream; direct CDN page_fetch often returned HTTP 0/TypeError:Failed to fetch. OL 6c03418 nevertheless ended with 9/9 stored. Candidate failures and final results must remain distinct. Source/transport ordering should prioritize already successful same-DOI CDN routes, while maintaining alternative candidates and type/byte verification. HTTP 0 alone does not establish CORS, VPN, blocking or bad credentials; octet-stream alone does not establish HTML versus mislabelled image bytes.

3. Wiley discovery failure: anie.9519061's current result discovered 0 labels and no TOC. The retrieved selected failure-event list is empty; no response code establishes absent images. Its historical v6.2.15 report says five figures captured, but that old report is not new accepted media. Next verification should inspect current page access/challenge/DOM readiness and figure/caption selectors before making a no-image assertion.

These are prioritized diagnosis steps, not deployed fixes. Capture code, runtime version, sorting, media assets, literature publication data and quarantine were not changed in this turn.

## Read-path distinction

An earlier attempt (workflow 35810905167) received HTTP 403 on public reportIndex and manualSnapshot GETs. The authorized R2 read above succeeded. This was an assistant-side evidence-read problem and is not evidence of a failed user report POST or publisher capture. Only an audit-reader workflow and audit records were written to Git in this turn; R2/media writes=0. No periodic assistant monitoring was created.
