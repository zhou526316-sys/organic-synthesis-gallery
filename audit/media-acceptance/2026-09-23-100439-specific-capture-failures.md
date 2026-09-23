# Specific capture failures and reliable automatic diagnostics

Context: user clarified that the priority is detailed failure evidence arriving automatically so the assistant can identify and fix causes promptly; a local progress panel alone is insufficient.
ReadAt: 2026-09-23T02:04:39.068Z (10:04:39 Beijing). The latest available manual snapshot in this read was uploadedAt=1790127340786 (09:35:40 Beijing), NOT a current desktop view.
Evidence workflow: 35808839983, job 107015568098; success.
Evidence artifact: 10728996921; ZIP SHA256 532cf2fcd2dfddb2e47b9d4e28e74c2e34d38e00b2e7a107ce2059a4c45c1d65; verified after connector download in the conversation container.
Summary identifies controllerRevision=2.2.21, capture version=6.2.20. This resolves the revision ambiguity of the earlier compact reader. 5 completed results: 4 success, 1 partial; 25 figure staging receipts, not 25 independently verified unique new images.

## Evidence-specific findings

1. Nature Communications DOI 10.1038/s41467-026-77963-6: Figure 1 and Figure 2 failed twice each with the exact extension message `gm_request_error:Refused to connect to ... : Request was blocked by the user`. Event times 09:29:20, 09:29:43, 09:30:06 and 09:30:29 Beijing; HTTP status=0. Figures 3-7 were later stored; final 5/7 partial. This is explicit extension connection-denial evidence, not missing publisher images or a measured-resolution failure. It does not establish which human click or retained extension rule produced the denial. Do not bypass user/extension permissions. Add the already-used media.springernature.com origin explicitly to both standalone and integrated metadata, classify permission denial separately, and have the user confirm that origin's permission where needed. No claim this alone overrides an existing deny decision.

2. ACS JOC 6c01270/6c01295/6c01302: several /view-large/figure and DownloadFile/DownloadImage.aspx candidates returned HTTP 403 or were rejected by sniffing as application/octet-stream; ordinary page_fetch also returned Failed to fetch for some direct CDN sources. Subsequent same-article CDN acquisition succeeded and the articles reported 4/4, 5/5 and 8/8 stored respectively. A failed candidate request must not be counted as final failed capture. The octet-stream messages alone do not prove whether the returned bytes were HTML, another unsupported format, or a mislabelled image. No raw byte/publisher-content verification was performed for these error responses. Practical next optimization is source-choice/transport ordering based on verified successes, not weakening the DOI guard or accepting arbitrary octet-stream bodies.

3. Existing finishPairedJob published resultKey before awaiting uploadReport; the Gallery controller closes the publisher tab after observing resultKey. Therefore the final report POST can be interrupted even when image saves completed. The revised tested path persistently queues the sanitized final report BEFORE resultKey is visible and sends it from the long-lived Gallery page. A targeted regression verifies this exact ordering and that delivery still works with the active publisher job removed.

## Implemented upgrade, not deployment claim

PR #143, tested source head 7e290b5c9f3514a44c1d31ee0a085f91c5afb846. Bridge/controller revision 2.2.22, capture protocol/checkpoints remain 6.2.20.
Final feature workbench 35809120012 succeeded, and PR diagnostics/window guard jobs subsequently succeeded. Deployment is still a separate acceptance step.
Tests: 20 panel, 16 automatic-report, 12 controller, 21 identity, 9 staging receipt, 11 release and 17 paired Chromium assertions. GM APIs/publisher access are mocked; no live installed-user extension acceptance is implied.
New per-job diagnostic checkpoints contain whitelisted request/response stages, HTTP status, sanitized requested/final URLs, timing and Retry-After when exposed, measured size/type, figure label, error text, task nonce, controller revision and capture version. Important event history is bounded to 48 failure entries plus recent context; checkpoints are coalesced, not an unlimited event log.
Failed candidate checkpoints use status=progress and candidateSource=auto_failure_checkpoint; final results use auto_final_result, retaining actual success/partial/failure. Task/event identity is retained in diagnostic_context trace metadata through the existing backend API. HTTP 0 remains unknown when the runtime does not provide an explicit cause; no automatic claim of CORS/proxy/server failure.
Persistent local outbox, one Gallery sender, 10-second send-check cadence, positive server stored/DOI/attemptId receipt required; network failures retain pending reports with 30-to-300-second exponential backoff. A newer pending revision survives an older receipt. Queue is limited to 200 entries with an explicit overflow state; it does not silently report success when full. Telemetry lock is separate from the capture-controller lease. It does not open pages or modify media checkpoints. Browser throttling/offline/authorization can delay delivery.
Panel polls local state once per second and distinguishes active-paper counts from completed-paper totals. It also shows diagnostic delivery state. This is automatic evidence delivery to the server, not a claim that an assistant is continuously executing outside the conversation. There is no background automation task in this turn.
No Worker media intake, D1/R2 media objects, quarantine boundary, literature datasets, scheduler sorting or existing user-shell functionality is changed by this release.

## Progress replies in this turn

我先加实时进度面板，显示当前 DOI、正在处理的图号、已保存数量、失败原因和最后更新时间，并明确区分“已暂存”和“已发布”。这批不改抓取顺序和防污染校验，避免影响正在运行的任务。

重点改为每次失败自动上报具体原因，而不只是给你一个进度面板。我会保留任务与页面 DOI、失败阶段、请求方式、HTTP 状态、图片尺寸、重试次数和错误详情，并区分“抓图失败”“上传失败”“报告没送达”，避免再让你反复手动上传日志。我现在先核对现有上报接口和最新失败记录，按实际证据修问题；单纯延长超时或降低清晰度门槛不作为默认处理。

又定位到一个会影响我判断的问题：旧代码先通知控制页“本篇结束”，随后才上传报告；控制页可能在报告送达前就关闭出版社标签页。这能解释为什么本地已有抓图结果，服务器报告却滞后。我正在把报告先存进本机待发送队列，再由始终打开的 Gallery 页发送。这样关掉文章页也不会丢掉待发报告；发送失败会保留、重试，并明确显示“报告未送达”，而不是把它算作抓图失败。

这次取到的详细日志已经定位了那篇 Nature Communications 为什么只抓到5／7张：Figure 1、Figure 2 的扩展请求都明确返回Request was blocked by the user。这是浏览器扩展侧的连接许可拒绝，不是“图片不存在”或“分辨率太低”；日志本身不能确定是哪次授权操作造成的。ACS 的情况不同：部分候选地址返回403或无法识别为图片，随后换用同篇文章的CDN地址成功了。因此，报告必须同时保留“候选失败”和“最终成功”，不能见到一个错误就判整篇失败。我会把这类权限拒绝单独标明，并补齐Nature图片域名的显式声明；已有拒绝设置仍需你在扩展中确认授权，不能由脚本绕过。
