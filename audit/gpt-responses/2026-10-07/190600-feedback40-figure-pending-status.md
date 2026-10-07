Beijing time: 2026-10-07 19:06 +08:00
Context: simple UI feedback #40 — “正文图片待抓取” status check

User-visible reply:

对，**你现在看到它还在，是因为这条确实还没有正式修复上线。**

我刚重新核对后确认了两个问题：

- 之前做的 #40 修复 PR #387 一直停在 open，从未合并，所以 `main` 里仍然有“正文图片待抓取 / Article figures pending”。
- 我已经从最新 `main` 重做了一个干净补丁 PR #392：无正文图时整块隐藏；后续抓到正文图时再正常显示。这个 PR 只改 `src/main.ts`，不改抓图、Tampermonkey、PDF 或架构逻辑。

现在它还没合并的唯一原因是：**当前主线自身的 PDF Vault 新代码缺少 `cards.mjs` 的 TypeScript 声明，导致必需的 Frontend build/typecheck 质量门失败。** 这个错误与“正文图片待抓取”补丁无关，但按照项目规则我不能在必需测试失败时强行合并。

所以当前准确状态是：**文案问题已定位、UI 补丁已完成，但尚未上线；阻塞来自另一条 PDF/架构主线的编译问题。** 我没有越界去改 PDF 架构，也没有假装它已经修好。
