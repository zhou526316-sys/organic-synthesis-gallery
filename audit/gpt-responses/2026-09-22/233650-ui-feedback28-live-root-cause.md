# Feedback 28A live acceptance — root-cause checkpoint

Beijing time: 2026-09-22T23:36:50+08:00.
Context: UI/feedback continuation after PR #131; current user request 继续.
Implementation merge: 004779910a2ff384dd0224201bb48a8d61442a48.
Worker frontend deployment 35747353669 succeeded. Static Pages deployment 35747331123 failed at Package self-updating fallback Bridge runtime; downstream build/deploy skipped. No Bridge validation bypass was made.

## Fresh feedback
Export run 35747746429 succeeded. Artifact 10703796608 was downloaded and read; generatedAt 2026-09-22T15:29:46.999Z. D1 and R2 fallback both available. Nine open IDs: 8,20,21,22,23,24,25,28,29. Feedback 29 newly requests a larger, more readable full-text summary window. Keep the prior non-fullscreen requirement. Do not publish profile IDs or private metadata. Feedback 28 not closed here.

## Actual live evidence
Live acceptance run 35747683748 (f88a221b70995c831194812916a0acdd0f44fb91) failed; artifacts downloaded and parsed, not merely inferred from workflow metadata.
- GitHub artifact 10704256213: 4 tests passed, 2 failed. Both GIF tests passed original hash, animation, reload and bounded viewer assertions before failing on a remaining test-only otherPage.goto('http://127.0.0.1:4173/'). The production entry asset is assets/index-1zktqsZg.js.
- Worker artifact 10704380778: 3 passed, 3 failed. GIF and 30MB original hash reads returned the same non-image hash. Source inspection found installBrowserApiFallback in src/user-shell.ts checks parsed.origin but not parsed.protocol. A blob URL created on the Worker origin therefore gets rewritten as HTTPS, losing its blob prefix.
- Pages artifact 10703576778: entry network check failed before browser tests.

## Minimal production fix
PR #132, exact head 35dafdf7abfccde8f0d90abb7e8d1cc641dcb1dd. Only src/user-shell.ts and tests/status-image-errors.spec.ts changed (32 additions, 1 deletion). Require HTTP(S) protocol before the existing API-origin rewrite. Preserve HTTP routes and all existing assertions; add missing-blob-no-network and byte-exact string/URL/Request regression.

A dependency-free Node VM reproduction executed only the extracted wrapper and mocked native fetch (no network): before, blob strings and URL objects turn into HTTPS; after, all three input forms preserve local blob URLs, while the ordinary HTTP API request still maps to api.gczhouwld.com. This proof is not a substitute for pending PR and live browser acceptance.

The live adapter's otherPage navigation must be corrected independently. No hash or failure-preservation assertion may be weakened. Original bytes remain browser-and-origin local; no cloud original sync is claimed.

## User-visible progress since the earlier checkpoint
PR #131 已合并，Worker 前端部署成功。Cloudflare Pages 备用站这次发布仍失败；我会分别验收各入口，不把它们统称为“全部上线”。

线上验收已启动，覆盖原图保存、GIF 动画、30MB 边界和失败保护；测试不会写入真实阅读人数。同时已重新导出吐槽，核对是否有新增问题。

收到新增吐槽 #29：“全文摘要窗口可以再大一点，不然看不清。”我已将它排到下一批，保留非全屏要求；这轮先完成第 28 条的上线验收。

两个入口已完成首轮线上测试，但都未全通过。我正在核对失败记录，区分功能故障和线上测试条件差异；第 28 条暂不关闭。

定位到一个前端问题：Worker 入口的请求回退逻辑会误改写本地原图的 `blob:` 地址。另有一处测试仍指向本地预览地址；我会分别修正并保留原有验收断言。fileciteturn127file0L2-L2

修复已提交为 PR #132，只调整前端请求判断并增加防回归测试。GitHub 入口已通过原图、动画和刷新恢复检查；Worker 的原图读取问题还需等修复发布后复测。fileciteturn132file0L8-L13
