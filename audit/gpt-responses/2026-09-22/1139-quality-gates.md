现在的保证方式，不是“相信这次模型判断没问题”，而是把每轮更新拆成四个**可机器验收的质量闸门**。只有四类门槛都满足，才允许把这一轮称为完整更新；否则必须保留为未完成、source gap 或 pending。

1. **发现完整性**：15 本 active 期刊全部进入统一候选并集，使用所有配置 ISSN 的 Crossref online / published / created 三路、OpenAlex，以及出版社 Latest/ASAP/Early View 等实时入口。下一轮开始，每一本 active 期刊都必须在 review 里留下 `sourceChecks`：检查状态、候选数、合成相关标题数、来源类型和实际页面；403/登录墙也必须明确记为 blocked，不能把“没查到”当“没有”。另外我刚加入了 DOI 级历史回归：7 天安全尾扫内，任何以前已经 review 过的 DOI 如果今天从当前来源并集中无故消失，就生成 `historicalCoverageLosses`，这一日期不能被判定为完整。现在 `criticalSourceFailures`、`sourceFamilyGaps`、`sourceCoverageAnomalies`、`historicalCoverageLosses` 任一非零都会使发现质量门失败；`closureCoverageAnomalies` 则会强制阻止 `verifiedThrough` 前进。

2. **逐篇语义审核**：从今天 18:05 这一轮开始，不再允许单遍判断直接上线。第一遍对每个未决 DOI 做 include/exclude/pending；第二遍做“反方审核”：对每个 accepted 主动寻找它其实应被排除的证据，对每个高相关 rejected 主动寻找它其实应纳入的证据。最终 accepted/rejected 必须同时留下 `evidenceBasis`、`challengeDecision`、`challengeReason`，且两遍结论一致；任何分歧只能进入 pending，不能上线也不能静默排除。对 ACS Catalysis、异相/材料/聚合物催化，额外要求明确的广泛有机制备底物拓展证据，单纯“做了一个有机反应”不够。

3. **上线一致性**：新增的质量脚本会同时读取 GitHub 仓库权威 DOI 集和 GitHub Pages 实际部署 DOI 集。每个 accepted DOI 必须同时存在于两边；最新 review 中的 rejected DOI 必须同时从两边消失；线上唯一 DOI 总数必须与 `lastWebsiteSync.verification` 记录一致。任何一条不一致，质量门直接失败。TOC/Graphical Abstract 仍是下游非阻塞项，不会因为缺图阻止正确文献卡片先上线。

4. **回归检查正确性**：现有 capability guard 会检查 15 刊、3 天主窗口、7 天安全尾扫、Crossref created 晚入库救援、OpenAlex、多源健康、不得关键词静默排除；我又增加了历史 DOI 集合回归。现在不只比较“今天有多少条”，而是比较“以前已经确认存在的具体 DOI 今天有没有消失”。能力实现改变时也必须重新扫主窗口，不能拿旧能力结果继续复用。最终还要通过独立的 `.github/workflows/literature-quality-gate.yml`，它与主更新任务分离，不接受主任务自己宣布“成功”作为证据。

这套门已经实际运行，不是纸面规则。第一次质量门运行就因为旧 review 里的 `10.1002/anie.v65.39` 缺标题而失败；我修正数据后第二次通过。刚加入逐刊出版社来源身份检查后，最新质量门 **run 35683905489 已成功**。最新 audit v5 目前是：`sourceRecords=501`、`missingFromGallery=0`、`unresolved=0`、`historicalCoverageLosses=0`、`criticalSourceFailures=0`、`sourceFamilyGaps=0`、`sourceCoverageAnomalies=0`。同时它仍发现 9 月 21 日有 6 个 `closureCoverageAnomalies`，所以系统没有假装“全绿”，而是继续把 `verifiedThrough` 卡在 9 月 20 日。这正是 fail-closed 的行为。

关键实现已经进 main：历史 DOI 回归保护 `76da7d8f`，完整性测试 `b0389a5e`，端到端质量验证器 `9321a792`，独立质量门工作流 `1f55db19`，逐刊出版社证据校验 `8665cdd1` / `9bd03fb3`，质量规则文档 `538452f1`。

需要区分“工程上可保证”和“逻辑上无法证明”的边界：如果一篇刚发表的论文同时还没出现在出版社实时页、Crossref、OpenAlex 的任何一个可访问入口里，那么任何系统都无法在那个时刻证明它存在。我们能保证的是：**不把来源缺失当成无文献、不静默丢 DOI、不把单次模型判断当最终真值、不在上线数据和审核结果不一致时宣布完成，并用 7 天安全尾扫持续追回晚到记录。**

下一次 18:05 是第一轮完整执行“逐刊 sourceChecks + 双遍对抗式语义审核 + 端到端质量门”的正式更新。那一轮如果缺任何一项，CI 会直接红，不会被算作完成。
