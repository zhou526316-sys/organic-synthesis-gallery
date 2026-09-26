# Organic Synthesis Gallery 发布前主审核回报 — 2026-09-26 18:00

## 结论

- 状态：`ready_with_pending`
- compact 完整候选：10
- 双遍审核：10
- include：3
- exclude：6
- pending：1
- `reviewComplete=false`
- `publishableSubsetReady=true`
- `productionDataModified=false`
- 未请求 Pages 部署，未修改媒体或生产文献数据。

## 权威规则与快照绑定

- scopeRulesVersion：`scope-2026-09-24-v1`
- scopeRulesFile：`docs/literature-scope-contract.md`
- scopeRulesBlobSha：`f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- scopeCorrectionsFile：`audit/literature-scope-corrections.json`
- scopeCorrectionsBlobSha：`040902a773f72057dff59de5c66d27f568984813`
- canonical registry blob：`57050105998284ccbf87b1a5fe513b256b648949`
- handoff commit：`b809ab5e7e19c0524027fd5b07eb081078f8cfe2`
- compact blob：`95e10d6614baa2d10e71e027e00e96c406ca456e`
- latest blob：`a120ddf07733a3bc1374e892ee3084b580b166f8`
- generatedAt：`2026-09-26T09:10:27.774Z`（北京时间 17:10:27）
- latest/compact generatedAt一致；两份summary.unresolved均为10，等于完整compact数组长度；16本active期刊全部覆盖。

范围契约和纠错blob与上一槽一致。本轮仍重新读取契约、纠错、最近正式review、state、pendingReviewBacklog和scope-rechecks；未把历史待核查名单当成排除决定。受补充证据影响的ATHENA重新挑战并定案，其他历史边界记录逐项复核兼容性，没有进行无差别全站重抓。

## 机器发现层

- audit run：[36231935580](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36231935580)
- trigger commit：`ef1827913ab4afee9fbdf389937b8bc081b747ec`
- snapshot commit：`b809ab5e7e19c0524027fd5b07eb081078f8cfe2`
- galleryDois：611
- sourceRecords：770
- rawMissingFromGallery：642
- previouslyReviewedExcluded：632
- unresolved：10
- criticalSourceFailures：0
- sourceFamilyGaps：0
- sourceCoverageAnomalies：1（Science Advances）
- closureCoverageAnomalies：7
- verifiedThrough保持`2026-09-20`

当前主窗口为2026-09-24至2026-09-26；7日机器安全尾扫起点为2026-09-20，并继续包含verifiedThrough catch-up。覆盖深度警告不阻挡已经发现且完成双遍审核的显式DOI白名单，但继续阻止closure/verifiedThrough前推。

## 发布白名单

1. `10.1021/acs.orglett.6c03701` — 氧化还原活性芳基取代BIAN催化芳基甲胺空气氧化制备酰胺
2. `10.1021/acs.orglett.6c03497` — 极性与电自由基应变释放策略由双环[1.1.0]丁烷合成功能化2-氧杂双环[2.1.1]己-3-酮
3. `10.1021/acs.orglett.6c03647` — 光氧化还原/钴双催化共轭烯炔区域选择性1,2-氢胺化制备炔丙胺

三篇均保存了准确中文标题、文章特定scopeAssessment、实际摘要事实、firstPassDecision、challengeDecision和针对本篇最可能越界理由的challengeReason。

## 排除

- `10.1021/acscatal.6c05113`：仅证明柠檬醛单底物工业不对称氢化，主增量为催化剂空气稳定性、循环与机理；承认其实际转化和工业价值，但缺一般底物范围。
- `10.1021/jacs.6c11457`：全固态电池层状氧化物正极表面重构、界面钝化与循环性能。
- `10.1021/jacs.6c11688`：BODIPY功能化Hofmann框架的旋转交叉、客体约束和光学读出。
- `10.1038/s41467-026-78046-2`：氟流体凝胶的界面适应导热和力学抗性；摘要未取得，未虚构材料组成或数值。
- `10.1038/s41467-026-77978-z`：大肠杆菌能量系统重编程用于CO₂/甲醇生长与生物生产；摘要未取得，按现有主要贡献证据排除。
- `10.1038/s41467-026-78191-8`：ATHENA由早间pending解决为exclude。Nature官方摘要显示其模块化乙酰辅酶A/NADH通路、以BsRex/反义RNA构建遗传回路，并提高五种产物收率/滴度及完成5 L验证；这些真实生产证据已如实承认，但主要贡献仍是动态代谢通路/微生物底盘工程，不是一般有机制备方法。

## Pending与历史边界

- `10.31635/ccschem.026.202608262`继续pending。fresh compact仍无摘要，出版社DOI/PDF不可访问；缺醇底物类别、氧化产物、范围、分离收率及主要贡献。不能因能源主题直接排除，也不能凭题名中的alcohol oxidation纳入。原日期、firstRecordedAt、来源review、尝试页面和nextAction均保留。
- `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`：继续retain/include，旧文章特定证据与当前scope contract兼容。
- `10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`：继续retain while pending；未标记为已排除或已删除。

## 来源检查

16本期刊均保留机器sourceHealth。出版社完整列表检查计数为checked 0、blocked 6、unavailable 10，candidateCount保持null/unknown；单篇Nature官方摘要只用于ATHENA范围判断，没有冒充完整出版社列表实查。

## GitHub质量门

最终 prepublish gate：[36232331547](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36232331547)，job `108377689054`，结论success。

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：success
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：success
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- `releaseStatus=ready_with_pending`
- `conversionValid=true`
- 正式转换预演：success
- 严格发布包：success
- blockers：空
- productionDataModified：false

一次中间门禁run `36232280496` 因审核更新时间晚于runner时钟约1分钟而在正式转换预演失败；已将证据时间修正为已发生的17:16，未改变任何语义决定，最终门禁全绿。

## 提交与并发保护

- 审计触发：`ef1827913ab4afee9fbdf389937b8bc081b747ec`
- 机器快照：`b809ab5e7e19c0524027fd5b07eb081078f8cfe2`
- 初始staging：`61bc625001a028600fb5b803e42446f755ef59e9`
- 最终staging：`49409ffbf2d66c85da4b99a4e8bf0558134997bc`
- staging blob：`d8173a87689f4ad151036ca07d1b0d4993c80ed2`
- state：`3ed4b74f2b99426a5eeb27176c2a3411acad6791`
- state blob：`b13fec46da5554f8cd4973f005b19e99863afcdb`

写前已重读目标文件SHA。比较snapshot commit到state commit共5个提交，文件差异仅：
- `audit/prepublish-review-2026-09-26-1800.json`
- `audit/literature-update-state.json`

因此本轮未提前新增生产卡片、未修改TOC/正文媒体、未触发Pages生产发布，也未执行任何范围纠错删除事务。
