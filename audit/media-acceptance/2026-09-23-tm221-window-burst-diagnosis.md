# Tampermonkey 2.2.20 window burst — bounded diagnosis

Context: user reported approximately twenty browser pages opening and uploaded local logs. Beijing date 2026-09-23. This audit records diagnosis, not a claim that Bridge 2.2.21 is deployed.

## Actual uploaded evidence

Read-only workflow 35757322023 completed successfully and fetched /api/media/local-diagnostics, latest report index, actual public Bridge and Worker capabilities. Artifact 10708403242 (tm221-window-evidence) SHA256 5c897c3f6e26be505651d1c80865d30f1fc29b0b9738356f771fd30a09ca2d0c was independently checked in the conversation container.

Latest manual-local-log-upload: version 6.2.20, uploadedReason=user_menu, uploadedAt=1790095945283. Its current summary selected 20 jobs out of a 512-article registry. Start 2026-09-23 00:50:02.443 Beijing; finish 00:51:17.413. All 20 results are failed with reason controller_lease_lost. First failure is at 00:50:02.444, one millisecond after the batch start; adjacent failures are 3.502 to 4.009 seconds apart. Recorded success=0, partial=0, tocStored=0, figuresStaged=0, published=0. activeJob/progress/publisherHeartbeat were null at upload.

The payload also contains older per-DOI traces from 6.2.19, including 22:21 Beijing captures. Those are NOT new 6.2.20 successes, and were not mixed into this incident's totals. The server's per-DOI report index was also older than this batch. The relevant evidence is the current manually uploaded summary, not those older report traces.

## Source-confirmed defect and reproduction

Exact original public/toc-mainline.user.js Git blob: 4e31fc949efa6021fa6be32b02728dd239e04536.
The controller acquires a lease before awaiting network capabilities and queue reads. The start and resume menu handlers unconditionally delete that lease, then invoke controllerRun(), which returns immediately when its busy flag is set. A user click during automatic startup can therefore remove the running controller's own lease. This is an identified reproducible trigger, not telemetry proving which particular click deleted this user's lease.

The dispatch loop opens a tab before waitForResult() checks renewLease(). Lease loss throws, but the catch turns that scheduler error into a paper failure and continues the for-loop after sleep(3500). This explains the repeated launch pattern. The close call is not awaited or acknowledged before launching the next page; the uploaded logs do not themselves record browser tab closure.

Using the original production controller plus its actual menu callbacks in a controlled VM with mocked Tampermonkey storage, invoking resume during the capability fetch reproduces exactly 20 launches, 20 failures and controller_lease_lost for every result. This is not a real installed-extension browser experiment.

## Scoped patch under test

Bridge installer/controller revision 2.2.21. Capture protocol VERSION=6.2.20 is deliberately unchanged to preserve Worker compatibility and already-stored image checkpoints. No Worker storage, media deletion, old-media unquarantine, literature dataset or frontend UI change is part of this repair.

Changes: start/resume no longer delete live leases; local busy state is acquired before lease arbitration; lease ownership is checked before every launch; lease loss stops the whole batch without charging all papers a capture failure; own job cleanup cannot delete another controller's active task; asynchronous tab handles are awaited; tab.closed must become true after close() before another launch; infrastructure stop is latched against automatic timers until explicit resume; the existing legacy viewport queue/pump/scan are disabled in the integrated Bridge; prior controller_lease_lost results do not impose publisher cooldown.

Twelve targeted VM checks pass locally, including reproduction, repeated start, pre-open/post-open lease loss, unconfirmed close, async handles, ownership-safe cleanup, two control pages, manual pause, failure-reset menus, retry eligibility and retained DOI guards. GitHub verification is run 35758264253; deployment acceptance is a separate required step.

## User-facing progress messages in this turn

先在 Tampermonkey 菜单里点 **“中止当前媒体抓取批次”**，暂时不要再点“继续”。截图显示本批 **TOC 和正文图均为 0、失败 20 次**，不能当作正常抓取。

我先读取你上传的日志，查清是多个控制页重复派发、旧抓取逻辑同时运行，还是任务立即失败后连续开页。这一批只修复开窗失控和对应失败原因，不清空已有图片。

日志收到了：这 20 条失败的原因全部是 **`controller_lease_lost`（控制器失去任务锁）**，约每 3.5–4 秒又派发下一篇，第一篇仅 1 毫秒就报错。这批失败不是因为出版社没有图。

代码里有两个连在一起的缺陷：**“继续”按钮会删除正在使用的任务锁；控制器失锁后却仍继续循环开页。** 这足以复现你看到的现象。我现在补上失锁立即停整批、重复点击不抢锁，以及关闭确认后才允许开下一页。
