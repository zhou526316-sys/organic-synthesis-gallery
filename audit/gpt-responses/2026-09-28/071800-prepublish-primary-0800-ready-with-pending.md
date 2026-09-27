本轮 08:00 发布前主审核已完成，状态为 `ready_with_pending`。19 篇 compact 候选全部完成双遍审核：6 include、10 exclude、3 pending。未修改生产卡片、媒体数据，也未触发 Pages 部署。

### 6 篇发布白名单

1. `10.1021/acscatal.6c05705` — （ProPhos）镍催化芳基/杂芳基伪卤化物的均相 Suzuki–Miyaura 偶联
2. `10.1002/anie.5879363` — 阴离子掺杂锰氧化物接力催化醇的有氧氨氧化
3. `10.1002/anie.7110885` — 钙[4]芳烃催化对映选择性远程跨环去对称化构建固有手性双大环
4. `10.1021/acs.joc.6c01551` — β-内酰胺开环实现酚类修饰
5. `10.1021/acs.orglett.6c03620` — 通过 C–F 键重构实现未活化炔烃催化立体选择性分子间氟酰基化
6. `10.1021/acs.orglett.6c03784` — 铱/次硼酸协同催化亚砜亚胺对映选择性 N-烯丙基化

每篇均已保存准确中文标题、文章特定 `scopeAssessment`、实际摘要证据和独立范围挑战。

### Pending

- `10.31635/ccschem.026.202608472`：新增 pending。题名显示水参与的咔唑原位电化学重构，但尚缺起始物、重构产物、具体键变化、底物范围及分离收率，不能仅凭题名判断为一般骨架编辑方法。
- `10.1002/anie.8666577`：继续 pending。摘要确认 Co(II) 催化 BCB/吲哚环加成，但仍未取得底物/产物范围和分离收率。
- `10.31635/ccschem.026.202608262`：继续保留自 2026-09-22 起的 pending；仍缺醇底物、氧化产物、范围、分离收率及主要贡献证据。

三项均已合并到 `state.pendingReviewBacklog`，保留原日期、历史来源、取证页面和下一步动作；不会进入本次发布白名单。

历史边界项保持：

- `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`：retain/include。
- `10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`：保留卡片并继续 pending；后者仍不标记为全合成。

### 审计与质量门

- 范围契约：`scope-2026-09-24-v1`
- fresh snapshot：北京时间 2026-09-28 07:09:03
- active 期刊：16 本，完整覆盖
- gallery DOI：627；source records：741
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=0`
- `closureCoverageAnomalies=1`（Angew）
- `verifiedThrough` 保持 `2026-09-20`

[机器审计 run 36357688327](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36357688327)成功；latest/compact 同代，`unresolved=19` 与完整数组长度一致。

[最终预发布质量门 run 36358067683](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36358067683)成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- 正式转换预演及严格发布包：通过
- `publicationReady=true`
- `conversionValid=true`
- `reviewComplete=false`
- `publishableDois=6`
- `deferredDois=3`
- `blockers=[]`
- `productionDataModified=false`

[最终审核文件](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-09-28-0800.json)

提交链：

- 审计触发：`83ab39435c8aeabf362b869c46055c1ae3063402`
- 机器快照：`400a3919d284b2c7dcf1e7ec769551980b77c7b5`
- 最终 staging：`d658fd19d236d144e3d0271ee202b332ff1d9dbd`
- state：`4b98e2f93ecff89d90a0c0a9766d35a51aec9de1`

最终差异仅涉及审计触发/快照、目标 staging、audit state 和本回报文件；生产文献及媒体文件未变。
