# UI/feedback mainline realignment

Beijing time: 2026-09-25 12:49 +08:00
Context: user asked to recall and continue the “吐槽和优化界面” work.
Verification trigger commit: 3aa93e134f63c29c0f011ed609b088fe833c2235
Feedback export run: 36095858491
Artifact: 10847003654
GeneratedAt: 2026-09-25T04:47:27.868Z
Open count: 12
No new feedback since the 2026-09-25 09:35 export.
No feedback status change, no feedback-driven product repair, no deployment, and no synthetic reader writes were performed in this verification turn.

## Final user-visible reply

已接回并完成这一轮只读核验。

截至 **12:47（北京时间）**，最新重新导出的吐槽仍是 **12 条 open**，和上午 09:35 那次完全一致，**没有新增吐槽**。这轮我没有改吐槽状态，也没有擅自修代码。

| 条目 | 现在的核验结果 | 建议状态 |
|---|---|---|
| R2 最新：抓 TOC 时顺便做全文摘要 + 电脑摘要窗太小 | **窗口部分已完成**：PR #235 已把桌面摘要窗扩大到最大 1440px / 89dvh；但截至 12:42 的仓库审计仍明确写着“抓 TOC 时顺便生成摘要”**尚未接入**。虽然 Evidence v2 / GPT reviewed-summary 后端已经铺好，但不能把这半条算完成。 | 保持 open |
| #34 手机图片双指放大 | 已实现并做过 Chromium/WebKit 的 deployed pinch 验收。 | 可关闭 |
| #32 光效粗细可调 | 已实现 1–6px，并进一步修正为整张文献卡片发光，不是按钮发光。 | 可关闭 |
| #31 图片智能裁切/抠人/圆形 + 图片铺满按钮但文字可读 | 圆形/方形/自由裁切、手工抠图、原图恢复、图片作底图、对比度自适应文字都已做；**真正的 AI 人像自动分割没有做**。 | 部分完成，继续保留 |
| #28 原图/GIF/30 MB | PR #131 已支持原图、GIF 和 30 MB 上限，并保留原始字节。 | 可关闭 |
| #25 正文图和文献不匹配 | 这是 TOC/正文图获取与绑定问题，已明确归 Tampermonkey/媒体支线，不属于当前 UI 主线。 | UI 线不处理 |
| #24 吐槽上传图片 | PR #114 已支持吐槽附 1 张图片，私有存入 R2，并进入 GPT review export。 | 可关闭 |
| #23 CJC / OCF / JOC | 你后续已明确：**CJC、OCF 不纳入，JOC 纳入**；JOC 已从 2026-09-22 起前瞻加入。 | 可按后续决定关闭 |
| #22 Cite 功能 | PR #116 已有 ACS、Nature、APA、BibTeX、RIS 预览和一键复制。 | 可关闭 |
| #21 快速选择应直接对应收藏夹、可调颜色 | PR #128 已改成直接收藏夹选择，并补了阅读状态颜色。 | 可关闭 |
| #20 点击文献先看 AI 全文摘要再跳原文 | 后续你的产品方向已经改成“卡片上单独全文摘要按钮”，当前摘要面板已按这个新方案上线；原来的自动中转流程已被后续设计替代。 | 建议按“被后续方案替代”处理 |
| #8 正文图片太少/放大不清晰 | 属于正文图覆盖率和源图质量，继续由 Tampermonkey/媒体支线处理，不在 UI 主线重复修。 | UI 线不处理 |

所以真正还需要在“吐槽 + 界面”主线继续判断的，主要只剩 **R2 最新吐槽的第一半** 和 **#31 的 AI 自动抠人**；#20 是否保留旧的“先摘要再跳原文”流程，则取决于你是否想推翻后来确定的“摘要独立按钮”方案。

按项目规则，我现在没有替你关闭这些 open 条目。你可以直接回复“**按建议关闭已完成项，继续核实 R2 和 #31**”，或者点名哪些编号继续做。