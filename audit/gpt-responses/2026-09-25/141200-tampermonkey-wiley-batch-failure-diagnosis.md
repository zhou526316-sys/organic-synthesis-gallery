# Tampermonkey Wiley batch failure diagnosis

北京时间 2026-09-25 14:12 左右，Tampermonkey 2.2.32 最新日志显示连续 26 篇失败，但它们并不是“全站抓取都坏了”，而是同一类 Wiley/Angew TOC 任务连续失败。

关键证据：
- 连续失败数：26。
- 26/26 全部 publisher=wiley。
- 26/26 全部 mediaNeed=toc。
- 26/26 原因完全相同：toc_capture;toc=not_found;figures=not_requested;published=0。
- 这串失败之前的上一篇 10.1021/jacs.6c10123 是成功的，TOC 已 stored；再前面的多篇 JACS 也连续成功。因此 Controller、写入令牌、R2/Worker 并没有整体失效。
- Wiley 失败页实际上正常加载：trace 中 doiMatch=true，正文 textLength 约 2.3万–3.5万，没有 auth/challenge/403。问题发生在“页面已加载但脚本没有识别出 TOC 候选”。
- 当前 public/toc-mainline.user.js 里，collectCandidates() 只走严格 visualScope()；而旧的 scoreCandidate()/officialType() 仍保留了 Wiley *-gra-0001-* Graphical Abstract 文件名识别，但这条逻辑现在没有被 collectCandidates() 使用。Wiley 的 Graphical Abstract 在当前页面 DOM 中不一定位于 visualScope() 允许的 figure/graphical-abstract 容器，于是候选数变成 0。
- 这是一处防错图加固后的 Wiley 兼容回归，不是这些 DOI 无效。Wiley 页面本身存在 Graphical Abstract，例如 10.1002/anie.5617321 和 10.1002/anie.1974825。

处理方案：只给 Wiley 增加一个很窄的官方 TOC fallback——仅接受同一 DOI 已绑定文章页中、Wiley 官方域名下、文件名严格匹配 -gra-0001- 的图片；不恢复宽泛的邻近文字/整页语义扫描。这样能恢复 Angew Graphical Abstract，又不会重新引入之前 Scheme/正文图误判成 TOC 的污染风险。修复上线后再清除这批 Wiley 的失败冷却并重试。
