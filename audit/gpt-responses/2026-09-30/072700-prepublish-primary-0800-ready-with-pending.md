# Organic Synthesis Gallery 发布前主审核回报 — 2026-09-30 08:00

## 结论

本轮状态为 `ready_with_pending`。fresh compact 的 84 篇候选已全部完成逐篇双遍范围审核：

- include：18
- exclude：64
- pending：2
- reviewComplete：false
- publishableSubsetReady：true
- productionDataModified：false
- Pages deployment requested：false

本轮只更新预发布 staging、审计 state 和本回报；未修改生产文献卡片、TOC/媒体数据，也未触发 Pages 发布。

## 权威规则与输入快照

- Scope contract：`scope-2026-09-24-v1`
- Scope file：`docs/literature-scope-contract.md`
- Scope blob：`f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- Corrections file：`audit/literature-scope-corrections.json`
- Corrections blob：`040902a773f72057dff59de5c66d27f568984813`
- Canonical registry：16 本 active 期刊
- Handoff commit：`d2971cbb9b93ce6a7c71de2f4dc3d72d67d2c3b4`
- Compact blob：`e909a0d0e1a5aa69b3f146da15cb4a6c533cc2e5`
- Latest blob：`a6a80daf6a0b7cc5499052ba2de19324981f1007`
- Snapshot generatedAt：`2026-09-29T23:13:29.736Z`
- Machine audit run：[36643946675](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36643946675)

06:55 没有形成适用于本槽的 fresh snapshot，且不存在正常运行锁，因此按协议更新 push bridge。触发提交为 `484c91f9d6a5b8a40b456687b56d61db7cc07316`。新快照的 latest/compact 同代，两个 `summary.unresolved` 均为 84，compact 数组长度为 84，active journals 覆盖完整。

机器摘要：

- gallery DOI：676
- source records：708
- raw missing：590
- previously reviewed excluded：506
- missing from gallery：84
- potential gaps：31
- criticalSourceFailures：0
- sourceFamilyGaps：0
- sourceCoverageAnomalies：0
- closureCoverageAnomalies：7
- historicalCoverageLosses：0

closure 警告涉及 Nature、Nature Communications、JACS、Angew、ACS Catalysis、Organic Letters、JOC；因此 `verifiedThrough` 保持 `2026-09-20`。

## 18 篇发布白名单

1. `10.1021/acscatal.6c05418` — 亲电试剂调控的Cu/Pd催化烯炔烯丙基硼化实现化学与区域选择性分流
2. `10.1021/acscatal.6c05353` — Ir催化转移氢化实现α,β-不饱和酰胺向烯酰胺的分子内烯烃迁移
3. `10.1021/jacs.6c14022` — 铜催化张力驱动的对映专一性C–C键氧化加成
4. `10.1021/jacs.6c12207` — 通过钴电催化剂氧化态调控实现含氮芳烃选择性氢化
5. `10.1021/jacs.6c14478` — 光诱导镍催化对映汇聚合成含季碳立体中心的烯丙基1,3-二醇
6. `10.1021/jacs.6c09785` — 有序嵌段共聚物材料的空间限定化学官能化
7. `10.1021/jacs.6c13291` — 通过动力学减速追踪共价有机框架组装
8. `10.1021/acs.joc.6c01153` — 钴催化苄位C–H键叠氮化
9. `10.1021/acs.joc.6c02094` — 不对称Ir催化反式异戊烯基化实现(−)-Neoxaline的对映选择性形式全合成
10. `10.1021/acs.joc.6c01998` — 锗基自由基环化N-炔丙基芳胺与锗烷：简洁合成含锗喹啉
11. `10.1021/acs.joc.6c01677` — 双环[1.1.0]丁烷与靛红的高立体选择性反应
12. `10.1021/acs.joc.6c01873` — Rh(III)催化吲哚啉与硝基烯烃直接C7烷基化
13. `10.1038/s41929-026-01616-6` — 配体设计拓展低催化剂负载量Ni(I)催化芳基溴化物C(sp²)–杂原子偶联
14. `10.1021/acs.orglett.6c03866` — 芳基噻蒽鎓盐多样化碳同位素标记的实验设计方法
15. `10.1021/acs.orglett.6c03918` — 可见光能量转移催化肟醚与吲哚衍生物分子间[2+2]环加成
16. `10.1021/acs.orglett.6c03398` — 钯催化定向不对称C–H芳基化构建P-手性中心
17. `10.1021/acs.orglett.6c03933` — 光催化糖酸、苯乙烯与吡啶三组分脱羧糖基化
18. `10.1021/acs.orglett.6c03895` — 单原子镍催化吡啶和喹啉N-氧化物C–H酰胺化

每篇 include 均保存非占位中文标题、实际摘要/页面证据、`scopeAssessment` 五字段、first pass 与反向 challenge 结论。

## Pending 与历史边界项

本槽 pending：

- `10.1021/acscatal.6c05520`：摘要未给出底物/产物范围，主要叙述为催化剂结构—性能关系；需出版社正文或 SI 证明是否存在可推广的制备转化。
- `10.31635/ccschem.026.202608472`：目前无摘要、路线与底物范围证据；可能属于咔唑电化学骨架重构，需出版社摘要/正文后才能裁决。

持久 backlog 继续保留 `10.31635/ccschem.026.202608262`，未因超出发现窗口而丢失。

历史 scope rechecks 已重读：

- `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`：retain/include。
- `10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`：retain while pending。

Scope contract 与 corrections blob 相比上一槽未变化；两篇复用 pending 在确认 DOI、题名、摘要与当前元数据一致后才继承，没有仅更新规则版本号。未定案排查记录没有被当作排除决定。

## 来源核验

16 本期刊均保留 machine source-health 与 publisher live check 的区分。出版社列表检查为 6 blocked、10 unavailable，计数保持 unknown/null，没有将机器健康冒充出版社实查。

个别边界文章补用了出版社页面：PKS–NRPS 生物信号文章、Nature Synthesis Research Highlight、钙钛矿形貌材料论文均按主要贡献排除。高相关 exclude 均完成反向挑战。

## GitHub 质量门

最终预发布门：[run 36645106944](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36645106944)，job `109666146973`，结论 `success`。

通过项目包括：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`
- complete handoff 与 84 项 decision partition
- target-slot freshness
- 正式转换预演
- strict release bundle
- titleZh/scope correction 测试
- durable pending backlog 一致性

输出状态：

- `recordValidationPassed=true`
- `semanticDecisionSetComplete=true`
- `semanticFieldFailures=0`
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- `conversionValid=true`
- `releaseStatus=ready_with_pending`
- `reviewComplete=false`
- `productionDataModified=false`

## 提交链

- 审计触发：`484c91f9d6a5b8a40b456687b56d61db7cc07316`
- 机器快照：`d2971cbb9b93ce6a7c71de2f4dc3d72d67d2c3b4`
- staging 初稿：`d5723017e0930db495395c1a1de97ec6d3e1f12b`
- challenge 强化：`e827115f82d2f67bd0f6b71b97c9bbfcdaf2c2f4`
- 最终 staging：`7d21df9968429b31a27c1a6f4e5f903640cfd65e`
- 最终 staging blob：`d0ecc7bef6b096affac54a42cdc327594d1f1f35`
- state：`f84cf7000569df0248e8a8a9b13879d00a0e55e3`
- state blob：`d9b0ca1d918cecf290009fca1ed4c71420097be5`

完整 staging：[`audit/prepublish-review-2026-09-30-0800.json`](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-09-30-0800.json)
