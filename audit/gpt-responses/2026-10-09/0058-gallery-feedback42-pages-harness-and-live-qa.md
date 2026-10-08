# Gallery #42 continuation: Pages regression repair and live QA handoff

Beijing time: 2026-10-09 00:58 Asia/Shanghai
Chat context: “接续界面优化” → “那继续”; scope = user-approved feedback #42 status menu popover; do not reimplement previously merged #40/#41.

## User-visible response, consolidated

### #42 修复：发现并定位 Pages 发布阻塞

确认 PR #419 代码合并成功，Worker 正式部署成功，但 GitHub Pages 备用版本未能完成发布。

Pages 原失败 run 37808767228, failing job 113420815506: `tests/architecture-frontend.spec.ts` 19 browser tests, 17 pass and the two new #42 tests fail `page.goto: Could not connect to 127.0.0.1: Connection refused`. The new tests reuse the isolated status fixture requiring port 4173, while the Pages workflow only started port 4174. This is a test environment mismatch, not demonstrated product behavior failure.

The Pages workflow now starts verified Vite previews on **both** strict ports: 4174 for architecture tests and 4173 for the status fixture. Both must become responsive or the Pages build fails closed. Change limited to `.github/workflows/github-pages.yml`, commit `6fd3c9628eb830eaaf538e0ea1d08411ca66536d`. No DOI publication, media acquisition, PDF, TOC or account behavior changed.

### 正式网站仍在使用旧版界面

A read-only live-browser QA against `https://gallery.gczhouwld.com/` successfully opened a status menu, measured menu bounds, three status choices and scrollability, but observed `panel.dataset.anchor="status"` with **no** `panel.dataset.placement` marker. This marker was introduced by PR #419, indicating the canonical domain was still serving an older UI snapshot, consistent with the failed Pages deploy. A menu sometimes opening upward is NOT evidence that the specific #42 fix was deployed, because the original logic also opens upward if the available lower space falls below its 220px threshold.

Evidence: live GH run 37811565091, job 113429644961, printed `LIVE_FEEDBACK42_PROBE`; earlier initial live run 37811215573. All QA session API mutations were intercepted; no account, status, feedback or production writes.

### Current status and automatic acceptance

- PR #419 merged as `da6a08ff648344ec7b4d08efc1c9f1cad66579c4`; Required quality gate and integration tests passed.
- Worker deploy run 37808904732 and frontend sync run 37808767370 both succeeded.
- Previous Pages run 37809986632 failed under the earlier test environment and released concurrency.
- Corrected Pages run [37810874584](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37810874584) has now passed literature authorization and entered the build stage. It is **not yet a completed/deployed Pages release** at this checkpoint.
- A bounded, read-only Chromium acceptance script is committed at `scripts/verify-feedback42-live.mjs`. It uses actual scrolling and atomic DOM clicks against the custom domain to avoid unstable remote element IDs, checks viewport boundaries, upward/downward placement, popup visibility/painting, and status choice availability at 390px mobile and 1280px desktop, while blocking API write requests. Syntax verified.
- One-time workflow `.github/workflows/ui-feedback42-live-smoke.yml` has `workflow_run` gate for the exact corrected Pages run **37810874584** after a `success` conclusion, or can be invoked manually. Therefore the live test will automatically run after the specific Pages release succeeds; it does not cause an alternative release or routine perpetual smoke jobs.
- Its internal earlier pre-release runs failed because the **live old frontend** lacked `data-placement`; a separately introduced regex typo was subsequently corrected. Latest scripts: `36e7a9e` diagnosis; `7343377` one-time trigger; `af6ccfe` actual-scroll+visibility QA.
- #40 PR #393 and #41 PR #396 code left untouched; no feedback status updates; formal literature release protected.

### Terminal chat response to user

已完成 Pages 端口配置修复，并让新版 Pages 发布进入正式构建。此次只改发布测试环境，不重写 #42 产品代码，也没有重复修改 #40/#41。

发布状态需区分：**Worker 成功；Pages 已通过文献发布保护并进入构建，但尚未完成部署；正式域名还未证明切换到新版。**

我已配置一次性的自动线上验收：在本次 Pages 任务成功完成后，GitHub Actions 会检查正式域名的真实阅读状态弹窗，包括手机与桌面的展开方向、可视区域边界和可操作性。未成功之前不会将 #42 标记为完全解决。

Pages 进度：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37810874584

自动线上验收工作流：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/workflows/ui-feedback42-live-smoke.yml

## Response synchronization
The above response body records both interim/final content substantially; this audit commit is a progress/reply synchronization, not a literature release or feedback closure.
