# UI/feedback continuation — final verification checkpoint

- Recorded at: 2026-09-22T22:28:27+08:00.
- User requests: “你来接续吐槽和界面优化，先回忆再继续任务”; “继续任务”.
- Scope: feedback/UI mainline. No Tampermonkey/VPN Bridge acquisition source, production literature dataset, publication schedule, or production media repair gate was modified by this chat.
- Earlier progress and merge actions were already synchronized in audit/gpt-responses/2026-09-22/221933-ui-feedback-continuation-checkpoint.md.

## Verified implementation and deployment

- PR 128 merged at 2026-09-22T14:12:24Z, merge SHA 596d5481188c471a8d1c00bdcd18f80afd83103a. Expected PR head was a1dbd877e29bb3089b021b6308c2f481ac1a2acc.
- Feedback 26: direct anchored favorite-folder picker, multiple folder selection, explicit save/remove, persistence, and no accidental removal when reopening the picker.
- Feedback 27: selected/custom reading-status colors also style the action button; existing four management buttons and separate full-text summary remain.
- Normal required quality gate 35738010046 succeeded before merge, including frontend, Worker, API smoke and interaction regressions.
- Worker frontend sync run 35738701741 / job 106782502089 succeeded.
- Feedback review state was independently updated by another concurrent operation, not this chat. Commit bee4abd5865bf70d0e8b9a25a15e5248edf56c41 requests IDs 26/27 reviewed; actual apply run 35739000494 succeeded. No duplicate review write was made here. Remaining-open IDs in the plan are not a substitute for a fresh full feedback export.

## Live verification evidence — not an all-green result

- Live verification run: 35739935384, job 106786746856.
- Verification workflow commit: 0790653c383fa0fe77d5c7912e55dbd0dcb82bb7.
- Result generated at: 2026-09-22T14:24:51.468Z.
- Artifact ID 10698837535, name live-ui-feedback-26-27, SHA256 f6332623cea8b97202e182e5b869ad18d6bd1d64a77fb52f459888b7970aa405.
- Downloaded and inspected results.json and actual mobile/desktop favorite screenshots from the artifact. This is deployed-site evidence, not the earlier local preview evidence.
- Fresh anonymous browser contexts; all outgoing methods except GET/HEAD/OPTIONS were fulfilled locally with a 409 test response. No test favorites, reader events, feedback submissions or summary generation were sent to production. Local test preferences were discarded with the browser contexts.

### GitHub Pages, 1280px: passed

All five assertion groups passed; pageErrors was empty:
1. Four management buttons and separate summary entry.
2. Favorite panel anchored; selecting a folder saves; reopening does not remove it.
3. Folder persists after reload; More retains citation tools without duplicate folder checkboxes.
4. Selected and customized status colors match the action and chip, persist after reload, and preserve action shape.
5. Explicit removal clears favorite and folder; four management buttons remain.

Observed asset: assets/index-Cl-0QXkD.js. Observed paper: 10.1021/jacs.6c13517. Favorite anchor/panel gap was 6px; panel width 350px, inside viewport.

### GitHub Pages, 390px: functional groups passed, overall case failed

The same five functional assertion groups completed successfully. Favorite anchor/panel gap was 6px, panel width 330px, inside viewport. Actual screenshot was inspected.

The final pageErrors assertion failed on:
`/organic-synthesis-gallery.zhou526316.workers.dev/api/media/batch due to access control checks.`

The test deliberately blocked POST requests, including media batch/inventory and reader-count reads that use POST. Therefore this record does NOT establish whether the media error is caused by the test interception/CORS response or is independently reproducible in production. No assertion was removed, and no media acquisition code was changed to make the run green.

### Cloudflare Pages fallback, 390px and 1280px: not verified

Both navigations failed in the GitHub runner with:
`Error resolving “organic-synthesis-gallery-public.pages.dev”: Name or service not known`.

This does not establish universal DNS failure for every user. No fallback-site functional assertions ran.

Separately, the actual fallback deployment for merge SHA 596d548 failed: run 35738687093 / job 106782444151. The failing step was “Package self-updating fallback Bridge runtime”. `cloudflare/scripts/build-bridge-loader.mjs:59` threw `Error: Packaged Runtime validation failed.` Subsequent static build and Pages publish steps were skipped. Worker success must not be represented as fallback Pages success. This cross-branch packaging blocker is handed off; this UI chat did not change Bridge source or bypass its validation.

## Verification harness corrections / concurrent work

- Initial run 35739194144 failed before browser execution because npm ci requires the missing root lockfile.
- Second run 35739462262 failed before browser execution because @playwright/test was not installed.
- This chat's attempted dependency fix received HTTP 409 due to a concurrent edit. The latest main file was re-read; commit 0790653c already installed pinned @playwright/test@1.55.0 with an import check. Its changes were preserved rather than overwritten.
- TinyFish did not start because of insufficient wallet balance. No TinyFish browser success is claimed.

## Remaining work

- Reproduce the mobile media access-control result with safe read-only POST handling; distinguish harness behavior from a production failure before any production fix.
- Fallback Pages deployment remains blocked by Bridge runtime packaging validation; coordinate with the media/Bridge branch, do not bypass it from UI work.
- Feedback 28 (original/GIF status images up to 30MB) is not implemented in this batch.
- Reader-count concerns are not claimed resolved by this UI batch.

## User-visible progress since the earlier checkpoint

补充验收卡在我新增测试的依赖配置，还没执行页面检查。我正在修正；这不影响已完成的功能合并和 Worker 部署。

依赖配置已在最新 main 中补齐，公开页面测试开始执行。反馈 #26/#27 的状态回写也已成功，我没有重复提交或覆盖其他窗口的修改。

已实测到新功能：GitHub Pages 桌面端全部通过，手机端的收藏、配色和持久化检查也通过，但整轮测试仍有一条媒体跨域错误。另查到 Cloudflare 备用站的部署被 Bridge 打包校验挡住，不能把它算作已更新成功。

## Final user-facing response

已接续并推进这一批：**#26 收藏夹直达、#27 阅读状态配色已合并，GitHub Pages 已实测到新功能。** 对应 PR #128，合并提交为 `596d548`。fileciteturn39file0L4-L16

### 这批改好了什么

**收藏按钮直接打开收藏夹。** 点击星标后，在按钮旁选择收藏夹，支持多选并立即保存；刷新后保留。再次点击星标只是打开或关闭面板，不会误取消收藏；取消收藏使用面板内的明确操作。fileciteturn39file0L8-L8

**阅读状态按钮跟随状态变色。** 选择状态或自定义颜色后，按钮与状态标签同步显示。原来的四个管理按钮、独立全文摘要入口和“更多”中的引用工具仍保留。fileciteturn39file0L8-L8

### 上线与验收：不是全部通过

合并前的质量检查及 Worker 部署已通过。补充的公开页面实测结果如下：

| 检查对象 | 实际结果 |
|---|---|
| GitHub Pages 桌面端 | **全部通过**：收藏、取消收藏、刷新保留、状态配色和按钮布局均通过。 |
| GitHub Pages 手机端 | 上述功能检查均通过，但整项测试因一条媒体跨域错误未通过；还需区分测试拦截与真实页面故障。 |
| Cloudflare Pages 备用站 | 本次测试环境无法解析域名，未能验收；另查到该次部署确实在 Bridge 打包校验处失败。 |

因此，**GitHub Pages 已确认出现新功能，但不能说两个入口都已更新完成。** Cloudflare 备用站的失败部署没有被当作成功。fileciteturn44file0L2-L2

[查看手机端收藏夹实测截图](sandbox:/mnt/data/live-ui-35739935384/github-390-favorite.png) · [完整验收记录与截图](sandbox:/mnt/data/live-ui-feedback-26-27-35739935384.zip)

反馈 #26/#27 的处理状态已成功回写；本批没有重复提交。**#28 原图/GIF 上传、阅读人数专项，以及上述两处验收遗留问题仍未关闭。**fileciteturn41file0L2-L2 本轮变更与验收记录已同步仓库，抓图和油猴代码未改动。
