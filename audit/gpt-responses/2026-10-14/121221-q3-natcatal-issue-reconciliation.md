# 第三季度历史回溯：Nature Catalysis 逐期核验

- 北京时间检查点：2026-10-14 12:12:21（UTC+08:00）。
- 用户任务：承接 PR #640 后的全部历史回溯约束，转向出版社 Research 逐期目录与在线优先发表文献交叉核验。
- 本轮 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/642
- 本轮 PR head：a4af81d2fd478c83b7b60effe04e0b181df0a364。
- 本条为回复与交接归档，不是审核记录已经合并或正式文献入库的凭证。

## 本轮完整回复

本轮已新增 Nature Catalysis 7月、8月两期的目录核验记录，并完成15篇未收录论文的逐篇范围判断：14篇排除、1篇待补证，新增准入为0篇。

PR #642 已提交。**截至北京时间2026年10月14日12:12，四项CI已成功，全站质量门禁仍在运行，尚未合并至 main。** 没有绕过门禁，也没有直接新增线上文献。

### 逐期核验得到的实际结果

本轮新增两期共18项目录记录，并与已有9月刊回执合并核对：

| Nature Catalysis 卷期 | Research栏目条目 | 首次在线属于Q3 | 其中已正式收录 | 其中尚未收录 |
| --- | ---: | ---: | ---: | ---: |
| 2026年7月 | 7 | 4 | 3 | 1 |
| 2026年8月 | 11 | 11 | 4 | 7 |
| 2026年9月 | 10 | 10 | 3 | 7 |
| 合计 | 28 | 25 | 10 | 15 |

这里有两个重要的归档边界。7月刊有3篇实际在6月首次在线，不能因卷期月份而算入Q3，也不能把它们视为学术排除。8月刊的Research栏目中有1篇Analysis；不能将栏目条目直接等同于原创合成方法学论文。

10篇已经正式收录的论文均没有重复提交。对另外15篇，每篇分别保留了主要贡献、真实化学转化、制备通用性证据和反向挑战。两遍判断由同一助手分别执行，不是两个独立审稿人；证据来自出版社公开摘要、文章信息及可访问章节，未声称逐篇取得完整全文和SI。

14篇排除主要涉及析氢、氧还原、催化剂工作态、CO2/CO电解性能或测量方法。判断并非简单按“电催化”或“材料”标签排除：其中存在乙醇、乙酸及真实C–C成键，记录明确承认这些事实，再判断论文是否以通用有机制备方法为主要贡献。

### 唯一待补证：CO2与亚磷酸根偶联制膦甲酸

Nature Catalysis，DOI：10.1038/s41929-026-01608-6；首次在线2026年8月25日。作者通过离子液体修饰铋电极，实现CO2与亚磷酸根的C–P偶联制备膦甲酸。

这篇没有被直接排除。它具有真实且有意义的目标分子合成，但本轮取得的证据尚不足以确认分离制备、纯度、物料衡算及方法可迁移性。论文摘要中的37.5%是法拉第效率，不能写成分离收率。因此保留待核，不把“暂未取得证据”写成“论文没有这些实验”。

### 数量与未完成项

重新读取 main 后，历史审核通过仍为116篇，原审核清单中的2篇待核保持不变；正式目录仍为1087篇，其中Q3为820篇。原有25篇已审待入库论文继续留在2026年10月15日北京时间08:00的原发布流程。

本轮15篇另存于补充审核记录，尚未接入季度复算程序。因此，不能把生成队列中的11423条擅自减去14或15，也不能把本轮1篇待核混入原清单的2篇待核。这个统计接入仍未完成。

目前也不能宣布Nature Catalysis整个Q3、更不能宣布16刊季度验收通过。8月刊使用的是出版社官方目录索引与逐篇DOI证据，原始目录页直连仍未成功；分配到后续卷期的Q3在线优先论文也尚需交叉核查。

下一阶段的具体缺口是：将这15条判断与冻结来源队列对齐并接入复算，补齐膦甲酸论文的制备证据，再继续在线优先与其余期刊逐期核验。本轮完整记录已写入Git，历史总追踪Issue #498已更新并回读。

## 证据与执行检查点

### 新增文件（PR中，尚未合并）

1. audit/historical-publisher-issues/2026/nature-catalysis-issues-07-08-research.json
2. audit/historical-scope-assessments/2026-10-14-nature-catalysis-issues-07-09.json
3. tests/historical-natcatal-q3-issue-receipts.test.mjs
4. .github/workflows/historical-publisher-receipt-ci.yml

新增11项确定性测试；专项CI通过，但未取得原始测试日志，不额外声称11/11零跳过。历史快照变动时，三项现状对照测试明确跳过并说明不构成当前目录验收；静态回执完整性测试保留，避免阻断后续08:00正常发布。

### 最新读取的主线来源SHA

- public/toc-demand-live.json: c235b60ec55d5c8c1b95c5fe10ae12a336c66d1b；1087篇的既有完整快照，最终回读SHA未变。
- audit/historical-reviewed/approved-admissions.json: 1810870edb12c55356f935d12f910f3f7634b2f3；116 accepted、2 pending，最终回读SHA未变。
- docs/literature-scope-contract.md: d3507dde0d44c4482ce9866ff81c73f0f97b0a92。
- audit/literature-scope-corrections.json: 109be3cc5abedc62f744431e34faa0552564782d；原12条用户明确排除，不添加本轮14条学术排除。
- 本轮两期目录回执blob: e9460b1e3380d584907b7595ff87413c5cbd2f60，已在PR head回读。
- 本轮15篇补充审核blob: a188d3a1a59b863817acdf40b16f1d22ba2bcb77，已在PR分支回读。

### 当前CI（head a4af81d2fd478c83b7b60effe04e0b181df0a364）

- Historical publisher receipt integrity #38509646212: success。
- Historical official publisher-issue reconciliation #38509646235: success；这是CI结果，不是全季度出版社完整性证明。
- Target journal Tampermonkey capability regression #38509646207: success。
- Private PDF capture v2 regression #38509646195: success；回归测试不是本轮历史PDF采集。
- Site quality gate #38509646307: in_progress；未取消、未重启、未绕过。Worker dry-run与Production API smoke已有成功结果，最后完整工作流仍未结束。
- PR #642: open、merged=false，5 commits、4 changed files、无目录/准入/媒体文件修改。

### 出版社证据

- July issue: https://www.nature.com/natcatal/volumes/9/issues/7?error=cookies_not_supported
- August official indexed issue: https://www.nature.com/natcatal/volumes/9/issues/8
- Foscarnet official article: https://www.nature.com/articles/s41929-026-01608-6；再次检索核对Published 25 August 2026、IL@Bi、37.5% Faradaic efficiency。
- 已有September回执: audit/historical-publisher-issues/2026/nature-catalysis-issue-09-research.json。

### 总追踪回读

Issue #498 comment6160669416已真实写入并GET回读：
https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6160669416

## 必须保留的下一轮边界

本PR的补充学术排除与待核记录目前不被Q3复算读取；不能为改善数字而直接修改原始source shard、永久owner排除或approved-admissions。不能把25 waiting误认作本轮已正式发布。不得新增18:00发布或补发，历史补录不得进入Today、Hot、每日新增或公众号新增。本轮没有进行历史TOC/正文图/SI/PDF采集；并行正文专项与历史范围审核分别治理。
