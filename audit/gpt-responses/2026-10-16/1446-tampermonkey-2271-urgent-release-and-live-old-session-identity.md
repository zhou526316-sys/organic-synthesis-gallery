# 2026-10-16 Beijing — User demanded urgent Tampermonkey fix

## Partial user-visible response
新版已正式上线。PR #720 已合并，35/35 CI 通过；Bridge 2.2.90 / engine 6.2.71 both canonical domains 200, both 506098 bytes; TOC-only historical and PDF entitlement tests passed. Released code allows Gallery image outbox to drain alongside active publisher task, defers additional figure upload after timeout, and backpressures saturated PDF queue rather than waiting on long synchronous upload. Deployment itself is not owner-browser acceptance.

## Evidence / postdeploy followup
Read-only R2 acceptance action 38862631668: latest manual owner file STILL uploadedAt 1792121540542 / 6.2.70, running phase 7 of 226; R2 stage index increased to 3948 valid records (6251870 bytes), captured index to 1108. This change cannot be fully attributed to current script.
Read-only auto report action 38862749739, job 116848562624: rolling report index holds 1000 DOI, 56 final job receipts / 32 distinct DOI after 02:56:47Z, 10 partial / 41 failed / 5 success, 40 heartbeat failures, 1 cloud-stored PDF, 7 PDF deferred. Report details explicitly identify many older 6.2.65 engines and recent 6.2.70 results, not an authenticated owner 6.2.71 result. Last observed full terminal report 06:25:21Z was `installRevision=6.2.70`, even though 6.2.71 was served by 06:22Z; likely previously open old tab.
Crucial positive example from old 6.2.70: JACS `10.1021/jacs.6c15006` now has 8/8 figures staged, fulltext stored, and cloud PDF stored in the 06:16-06:20Z attempt, after previously 2/8 with PDF deadline. Some other recent ACS JOC articles got 5/5 and 6/6 figures, although PDF locally deferred. This proves real progress, not a true 6.2.71 throughput acceptance.
Connected browser list in prior turn had no Gallery tab and tools cannot interact with local Tampermonkey extension or force reinstall. User action required: install 2.2.90, close/reload any old Gallery controller tabs in both browsers, keep one active owner controller, run missing-only, and upload fully finished 6.2.71 log. Preserve local data/queues, do not clear extension storage.
No additional production code edited in current quickcheck. Existing source release merge SHA fa4fb468b80abe9f965693c0ed132dfe4b4506fc; verification action 38860805467 and readback 38860805285 confirm canonical scripts, no auth browser.

## User-visible final answer

**已完成代码修复并上线，但还缺最后一步：让你本机旧脚本退出，真正启动新版。**

线上版本已经确认是 **VPN Bridge 2.2.90 / 采集引擎 6.2.71**，两域名部署正常。新版本已让正文图在后台独立补传，避免一张图上传超时拖住后续图片；PDF 队列满时也不再阻塞整个 DOI 队列。

我刚刚读取最新服务器回执，发现仍有 **6.2.65 和 6.2.70 旧实例**在发送结果，暂未见能确认来自 **6.2.71** 的完整抓取回执。这是当前无法宣布恢复吞吐量的直接原因。另一方面，先前失败的 JACS `10.1021/jacs.6c15006` 后续已经补到 **8/8 张正文图、文本已保存、PDF 云端已保存**，说明采集并非完全失效。

请做一次版本切换：打开 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 更新脚本，关闭之前正在运行的旧 Gallery 控制页，在你使用的浏览器重新打开 https://gallery.gczhouwld.com/，确认版本是 **2.2.90 / 6.2.71**，再运行「只补缺项」。不要清除 Tampermonkey 存储、已有图像或 PDF 待补传队列。

**代码修复与上线已完成；真实浏览器连续抓取是否达到 10 月 14 日的 101 篇基线，仍必须依据新版运行日志验证，不能虚报已解决。**
