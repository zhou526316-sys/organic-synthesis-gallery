# Organic Synthesis Gallery — 正文证据覆盖与检索升级 0.2.5 生产验收
- 北京时间：2026-10-13 20:21:47，Asia/Shanghai
- 对话：用户明确提出“正文当然要抓，不然无法保障正确的索引”
- 生产仓库：zhou526316-sys/organic-synthesis-gallery，main 唯一基线
- 修复 PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/610
- 合并 SHA：375cf59167f124f5853c987f97dd717e28965d84
- Pages 正式部署：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38394803958；成功；用户脚本线上读回 @version 0.2.5
- 相关 Chromium/Node CI：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38393947867，已成功
- 全站质量门禁：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38393947870，已成功
- TOC/PDF/媒体/站点回归均成功
- 变更：仅 historical user.js + 3 tests + docs + Pages版本断言。引入 captureRevision stable once-recheck, coverage ledger, H4/synthesis section, section/caption/table local full-search, full hit count with pagination, limited chemical synonyms.
- 安全与科研真实性：非科学正文、参考文献或法律页脚不计科学正文；单纯提及≠本篇核心方法学；HTTP403/429和登录挑战不自动绕过，版权不明的全文不自动公开；旧全文本机不上传，尚未接入公共 FTS。
- 仅代码与模拟CI通过不等于用户已运行真实 publisher batch。正式部署已确认，但真实 DOI 全库完成量尚待用户浏览器 IndexedDB 与新诊断回执统计。

## 用户可见回复（按完整顺序）

### 初始结论（已作为阶段性回复发出）
正文采集必须是 Gallery 检索升级的核心，而不是可有可无的补充。标题和摘要往往遗漏催化剂、反应机理、控制实验、底物拓展和失败边界。正式 DOI 全覆盖；按 Results、Mechanistic Studies、Substrate Scope、Experimental、图注与表格建立真实科学证据；区分提及与核心贡献。版权与合法私人索引分层。

### 代码通过验收及合并（已作为阶段性回复发出）
PR #610 的历史正文专项、Chromium、全站 Playwright、TOC、正文图、PDF 和 Worker/API 相关检查全部通过，已合并至 main，SHA 375cf59167f124f5853c987f97dd717e28965d84。新版本扩展正文覆盖台账、一次性解析复查及章节本机检索，但不等于全站服务器已有全部文章正文。正式 Pages 部署及线上脚本读回另行核验。

### 终结回复
**历史科学正文补抓 0.2.5 已正式上线。**

[更新独立补抓脚本 0.2.5](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)

[PR #610](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/610) 已合并，提交为 `375cf59167f124f5853c987f97dd717e28965d84`。[Pages 部署 #38394803958](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38394803958) 成功，线上已读回 `@version 0.2.5`。

这次新增的「**全库正文覆盖**」会以正式 DOI 目录为母数，区分已存正文、从未访问、许可待核实、正文不足、明确访问受阻等状态，不再把当前批次的 39 篇当作全库总数。原来的「**一键补抓全部缺项**」也会对旧解析器造成的、DOI 已核验的许可或科学正文漏判提供一次复查机会，继续跳过真正保存成功的内容。明确的 HTTP 403/429 和身份验证阻断不会被自动绕过。

本机全文搜索现在会扫描**科学章节、图注和表格**，对 LMCT、手性磷酸、轴手性等保守的等价术语查找正文证据；命中数不再截断为前 20 篇，结果可分页展开，并标明命中章节。但某术语被提及，并不自动证明它是论文的主要创新。

你现在可以在原 Edge／Chrome 的 Tampermonkey 中更新上述脚本，刷新 Gallery 首页，先点「全库正文覆盖」查看完整台账，再点「一键补抓全部缺项」继续处理。**需要浏览器保持运行**，已有本机正文不会重新抓取。

**尚未完成的一项关键工作**是让这些合法取得的科学正文进入全站共享的章节级检索体系。目前它们仍保存在当前浏览器，不能把本机命中算成公共网站的搜索覆盖；后续必须按 DOI、章节、来源哈希及使用许可建立隔离索引，再验收实际召回率。这次也没有声称所有历史全文已经抓取成功。原有 TOC、正文图、PDF 及每日 08:00 正式发布规则未改变。
