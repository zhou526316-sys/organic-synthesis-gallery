# Gallery 界面优化 — #40/#41复核与 #42 修复检查点
Beijing time: 2026-10-08 23:57 +08:00
Chat context: 接续界面优化：用户“批准，但是40和41似乎之前修好了？”
Mainline code was not altered by this chat. Functional work is on PR #419.

## User-visible reply (substantially as sent)

你记得没错。重新核对 GitHub 后，确认 **#40 和 #41 此前都已经修复并合并**，不应该重复修改。

| 反馈 | 已有修复 | GitHub 记录 |
|---|---|---|
| #40 正文图待抓取提示 | 无有效正文图时隐藏整个正文图区，有图片时正常显示 | PR #393，提交 `a18d94e` |
| #41 手机加载和 TOC 慢 | 优先加载屏幕附近的 TOC，减少首批请求，并推迟非必要的 PDF 状态模块加载 | PR #396，提交 `d3983db` |

两项 PR 均已合并至 `main`。因此本轮保留它们的已有优化，不重新设计或覆盖。

**本次实际需要修改的是新反馈 #42：阅读状态弹窗展开方向不合理。** 我会只针对这项缺陷做修复和验收。

## #42 修复进展

已提交针对性修复：PR #419 (https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/419)。

这次改动包括：
- 弹窗优先向可用空间更大的一侧展开，而不是固定偏向下方。
- 根据实际可视区域限制弹窗高度，减少内容被屏幕边缘截断的情况。
- 兼容手机端可视区域变化，保留内容较多时的内部滚动。
- 新增 390px 手机和 1280px 桌面浏览器回归测试。

代码已提交，正在接受 GitHub Actions 检查。**此时还不能算正式上线。**

另外纠正上一轮诊断中的一处混淆：网页上的 `Fetching original TOC / Figure` 属于 TOC 图片加载提示，不能直接作为 #40「正文图待抓取」修复失效的证据。当前 `main` 中，无有效正文图时隐藏图片区的逻辑仍然存在。

#41 的优化也仍保留在代码中。是否进一步提速，需要新的手机端实测数据，而不是重复提交同一套优化。

## 当前检查点和剩余步骤

- PR #419: branch `fix/ui-feedback42-popup-viewport-placement-20261008`, current head `b5cd0ed22897b8f0c83f0b04488fcb4f4d1fb738`. Open, not merged.
- Source change: `src/user-ui/paper-actions.ts`: compare above/below usable visual viewport and clamp width/max-height, preserve summary panel path.
- Browser test: `tests/architecture-frontend.spec.ts`, 390px and 1280px. Test-only Playwright fixture corrections were committed in subsequent revisions; current CI is queued owing to substantial GitHub Actions backlog.
- Previous product-code typecheck and build succeeded; independent local headless Chromium geometry fixture passed 4/4 cases; however the real-app current-head integration CI has not yet passed.
- Prior current-head failure was in the test harness (unpassed Playwright evaluate target, then unavailable document-scroll positioning); neither error established that the product position algorithm failed. Third revision uses deterministic test-only host positioning.
- At last inspection about 53 of the 100 most recent Actions runs were queued, with latest PR head quality tests not yet completed.
- **Do not claim production rollout or live acceptance.** Next stage: await scoped browser regression, inspect failures without changing unrelated #40/#41, merge PR #419 if accepted, verify Pages/Worker deployment and actual custom-domain display.
- Do not modify protected literature release schedule, authority data, TOC/Tampermonkey/PDF acquisition, or feedback status until verified.

## Final user-facing continuation

#40、#41 确实已经修好并合并；本轮没有重复修改。#42 的弹窗布局修复已经提交到 PR #419，并在本地 Chromium 的 390px/1280px、上下展开四个场景中通过。

但新提交的浏览器回归仍在 GitHub Actions 队列，**PR #419 目前尚未合并，正式网站也尚未更新**。本轮先保留现有工作和检查点，不在测试未完成时强行上线。下一次直接说“继续 #419”，即可从当前 PR 和 CI 状态继续验收、合并、发布。
