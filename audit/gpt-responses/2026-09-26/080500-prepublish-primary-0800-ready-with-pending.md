本轮 08:00 发布前主审核已完成，状态为 `ready_with_pending`。fresh compact 的 130 篇候选已全部完成双遍审核：16 include、112 exclude、2 pending。未修改生产卡片、TOC/媒体数据，也未触发 Pages 部署。

### 16 篇发布白名单

1. `10.1021/acscatal.6c06010` — Cp₂TiCl₂催化以二溴甲烷还原亚甲基化烷基酮
2. `10.1021/acscatal.6c06344` — 镍催化以烯丙胺为掩蔽烯基亲电体的β-甲基乙烯基化
3. `10.1021/acscatal.6c04049` — 钯催化芳基炔与降冰片烯衍生物的发散式环加成
4. `10.1002/anie.5220236` — 一锅两相光催化二氧化碳-羰基化级联
5. `10.1021/jacs.6c15284` — 铁电催化MHAT激活CF₃烯烃C–F键制备酮/烯醇稳定等排体
6. `10.1021/acs.joc.6c01844` — 胺催化酮与靛红衍生N-未保护酮亚胺的不对称Mannich反应
7. `10.1021/acs.joc.6c01202` — 钯催化经α-羰基自由基实现芳乙酸等价物的苄位氟化
8. `10.1021/acs.joc.6c01316` — 光诱导EDA复合物介导烯烃三组分三氟甲基化/杂芳基化
9. `10.1021/acs.joc.6c01156` — TBAI催化醚与喹唑啉-3-氧化物氧化偶联合成喹唑啉酮
10. `10.1038/s41467-026-78066-y` — 多变量金属-手性共价有机框架用于抗浸出的不对称转移氢化
11. `10.1021/acs.orglett.6c03675` — 区域选择性铜催化硼化环化制备硅杂环己酮
12. `10.1021/acs.orglett.6c03690` — 钴肟催化苯乙烯的Markovnikov选择性Wacker型氧化
13. `10.1021/acs.orglett.6c03198` — 铁催化甘氨酸衍生物与(杂)芳胺直接α-C(sp³)–H芳胺化
14. `10.1021/acs.orglett.6c03575` — 钯催化1,3-二烯的形式反Markovnikov氢酰胺化
15. `10.1021/acs.orglett.6c03122` — 膦介导脂肪族羧酸脱羧C(sp³)–S交叉偶联
16. `10.1126/sciadv.aeg4594` — 铬催化醇、醚及羰基化合物的脱氧官能团化

每篇 include 均保存了准确中文标题、文章特定 `scopeAssessment`、实际摘要事实、第一遍判断及独立 boundary challenge。

### Pending 与历史边界复核

- `10.1038/s41467-026-78191-8`：compact 只有 ATHENA 微生物合成平台题名，摘要为空；Nature 官方文章页本轮不可访问。缺少目标产物、底物到产物转化、范围及主要贡献证据，不能在代谢调控平台与一般生物合成方法之间定案。
- `10.31635/ccschem.026.202608262`：继续 pending；仍缺醇底物、氧化产物、底物范围、分离收率及主要贡献证据。

两项均已保留原始日期、尝试过的证据页面、来源 review 和下一步，并合并进入 `state.pendingReviewBacklog`；不会进入本次白名单。

历史 scope recheck 继续保持：

- `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`：retain/include。
- `10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`：保留现有卡片并继续 pending。
- Nature 官方页确认 `10.1038/s41557-026-02277-5` 是 Research Briefing，并指向另一篇研究论文，因此按新闻/评述内容排除：https://www.nature.com/articles/s41557-026-02277-5

### 审计快照

- 范围契约：`scope-2026-09-24-v1`
- scope contract blob：`f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- corrections blob：`040902a773f72057dff59de5c66d27f568984813`
- fresh snapshot：北京时间 2026-09-26 07:46:24
- handoff commit：`a49c9f12f442286c15bcb3b77cb7fa66e723ef54`
- compact blob：`60dffe9017a476965152f999c17b2dcc788216d7`
- latest blob：`43585328db50f77ce2773d266c8740de4561d7cf`
- active 期刊：16 本，完整覆盖 canonical registry
- gallery DOI：595；source records：762
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=1`（Science Advances）
- `closureCoverageAnomalies=7`
- `historicalCoverageLosses=0`
- `verifiedThrough` 保持 `2026-09-20`

06:55 未产生 fresh snapshot，确认没有同槽正常审计后，按规定通过 push bridge 补触发；机器审计 run 36202201542 成功：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36202201542

出版社完整列表未形成可审计计数，16 本刊均如实记为 blocked/unavailable，计数保持 unknown；单篇 Nature 官方页核验没有被冒充为完整列表实查。

### GitHub 质量门与提交

最终预发布质量门 run 36203069633 成功：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36203069633

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- 正式转换预演：通过
- 严格发布包：通过
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- `conversionValid=true`
- `reviewComplete=false`
- `productionDataModified=false`

提交链：

- 审计触发：`f831194cfbb28a40fb369ff069b6dfa0fd637cb4`
- 机器快照：`a49c9f12f442286c15bcb3b77cb7fa66e723ef54`
- 最终 staging：`73e2ac2843c87b32a701809a663405310a57f224`
- 最终 state：`b73c142c27f908e9ed0480cc4453209c2098ff6f`

最终 main 对比确认：从 fresh snapshot 到 state 只新增/修改 `audit/prepublish-review-2026-09-26-0800.json` 与 `audit/literature-update-state.json`，没有生产文献、媒体或网页数据文件变化。

最终审核文件：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-09-26-0800.json
