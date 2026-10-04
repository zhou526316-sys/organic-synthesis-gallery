# Organic Synthesis Gallery 2026-10-05 08:00 发布前主审核回报

## 结论

本轮状态为 `ready_with_pending`。fresh compact 的 55 篇候选已全部完成逐篇初审与反向挑战：12 include、37 exclude、6 pending。仅 `publishableDois` 的 12 篇可进入固定槽转换；6 篇 pending 继续留在 durable backlog，不阻挡已审定子集。

本轮没有修改生产文献卡片、媒体数据或 Pages 部署，也没有执行任何下线事务。

## 发布白名单

1. `10.1002/anie.3998761` — 生物基碳酸酯溶剂与共聚单体促进聚烯烃合成
2. `10.1002/anie.8598826` — 季铵苯胺四嗪的点击释放反应实现多功能生物分子支架级联组装
3. `10.1002/anie.5679433` — 三催化自由基途径实现非活化末端烯烃马氏选择性氢硼化
4. `10.1002/anie.9140489` — tRNA修饰香叶基-2-硫代尿苷促进RNA–脂质结合
5. `10.1002/anie.6256116` — 无过渡金属电还原不饱和羧酸酯与烷基卤化物脱氧偶联
6. `10.1021/jacs.6c14811` — 由伯胺模块化合成O-甲磺酰基羟胺
7. `10.1016/j.chempr.2026.103220` — 实用绿色的烯烃氧化胺化
8. `10.1039/d6sc06874j` — 水中亚胺键的“点击”形成
9. `10.1039/d6sc06246f` — 光/铜协同催化环丙烷1,3-氨基芳基化模块化合成3,3-二芳基丙胺
10. `10.1039/d6sc05973b` — 溶剂可编程的粘康酸酯有机催化基团转移共聚
11. `10.1039/d6gc04274k` — 面向废旧涤棉织物回收的PET连续糖酵解工艺
12. `10.1039/d6gc03816f` — α-氧代烯酮二硫缩醛的电化学发散式羧化与氢羧化

每篇 include 均保存文章特定 `scopeAssessment`、双遍决定、证据基础、最强边界挑战和非占位中文标题。

## Pending

- `10.1021/acscatal.6c06578`：缺文章类型、原创光电化学反应实例、底物/产物范围及分离制备证据。
- `10.31635/ccschem.026.202608090`：缺亚胺/亚胺鎓底物、产物系列和分离收率，尚不能区分一般制备方法与界面电场机理。
- `10.31635/ccschem.026.202607590`：已有宏环化与Pd催化C–H烯化片段，但缺完整底物系列、收率与可迁移性。
- `10.31635/ccschem.026.202607612`：缺螺硫吡喃成键/交换的底物范围与可分离产物。
- `10.31635/ccschem.026.202608472`：缺咔唑电化学重构的具体起始物、骨架变化、范围及分离收率。
- `10.31635/ccschem.026.202608262`：缺醇底物、氧化产物、范围、分离收率及主要评价终点。

六项均保留原日期、首次记录时间、来源 review、取证页、下一步和 2026-10-06 08:00 重试槽。上轮已审定的 `10.31635/ccschem.026.202607659` 已从 pending backlog 移除。

历史边界项继续按最新 scope-rechecks 处理：`10.1021/acs.joc.6c01559`、`10.1002/anie.9519061` 保留；`10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`、`10.1021/acscatal.6c05520` 继续作为现有卡片范围复核项。已下线的 `10.1038/s44160-026-01164-8` 未恢复。

## 范围与发现依据

- scope contract：`scope-2026-10-02-v1`
- scope rules blob：`d3507dde0d44c4482ce9866ff81c73f0f97b0a92`
- scope corrections blob：`4df5fb1fb5c25804846c70eee555e9ae798c5d99`
- canonical registry blob：`07de2cf052f55e91b3b1bb2554235ad2697d1838`
- handoff commit：`cfc41409b248fe445d1bc61ce5b1c184e39c97db`
- handoff blob：`504134c393811e5325b3df59857c90a0cd6d206d`
- latest blob：`87b2f289fa6f80d6373a1b56fd7165da7bace0ad`

scope 语义版本未变，但 rules blob 因单一 08:00 发布槽协议更新而变化；本轮已执行兼容性挑战。Chemical Science 与 Green Chemistry 只从 canonical registry 的 2026-10-01 prospective activeFrom 起纳入，Chem 从 2026-09-19 起纳入，没有恢复被移出有效期的 9 月记录。

对 28 条仅由 Crossref `created`/deposit 救援且 publisher online date 尚不可得的记录，`decision.date` 使用精确 `createdDate` 作为转换所需的保守发现/有效日期；原 `dateUnverified=true`、空 `onlineDate/publishedDate` 与 `createdDate` 均保持，未将其表述为出版社首发日。另对四条 RSC 记录以官方 article history spot-check 证实首发日与 createdDate 一致。

## 机器审计与覆盖

- fresh audit generatedAt：2026-10-05 07:07:41（Asia/Shanghai）
- active journals：16，全部覆盖
- gallery DOI：786
- source records：1719
- raw missing from gallery：1409
- previously reviewed excluded：1354
- unresolved：55
- potential gaps：25
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=4`：Chem、Chemical Science、CCS Chemistry、Green Chemistry
- `closureCoverageAnomalies=1`：Angew
- `historicalCoverageLosses=0`
- `verifiedThrough` 保持 2026-09-18

机器审计 run：[37242562115](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37242562115)，成功。

## 质量门

最终 prepublish gate run：[37243821247](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37243821247)，job `111557645919`，成功。

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- `conversionValid=true`
- 正式转换预演：通过
- 严格发布包：通过
- `blockers=[]`
- `productionDataModified=false`

staging commit：`030cc2114984b462e540ca7f2baf7a0a30b0a585`  
staging blob：`bddfab873f2dd55ffb516b7d0064e5b9db209467`  
state commit：`2c76c5bdcb9695381a84e6ca4e1036e0341603fb`  
state blob：`a18874da02c185b1549256d41d3af25cffcad7b6`

## 文件

- [预发布审核](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-05-0800.json)
- [状态文件](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/literature-update-state.json)

生成时间：2026-10-05T07:30:32.848+08:00
