# Organic Synthesis Gallery 发布前主审核 — 2026-09-27 08:00

## 结论

本槽状态为 `ready_with_pending`。fresh compact 的 56 篇候选已全部完成逐篇双遍审核，结果为 10 include、44 exclude、2 pending。10 篇 publishable DOI 已通过 GitHub 真实预发布门；2 篇证据不足项仅延期自身，不阻断白名单。

本任务没有修改任何生产文献卡片、TOC/媒体数据，没有请求 Pages 部署，也没有宣称已发布。

## 发布白名单

1. `10.1021/acscatal.6c05861` — Cu/TEMPO催化吡啶与醛直接C2季碳化反应
2. `10.1021/acscatal.6c06459` — 机器学习指导的光化学镍催化半胱氨酸芳基化
3. `10.1002/anie.6481438` — 光氧化还原/铬协同催化烯烃不对称双键异构化
4. `10.1002/anie.3147869` — Aza-Büchner–Curtius–Schlotterbeck反应选择性构建季碳中心
5. `10.1002/anie.5647747` — 笼间钠离子调控单原子钴催化生物质三组分合成3,4-无取代喹啉
6. `10.1002/anie.1148889` — MOF压电-光催化原子转移自由基聚合
7. `10.1002/anie.8809022` — Z式保持的Rh催化E,Z-二烯对映选择性氢芳基化
8. `10.1021/jacs.6c12299` — 两步合成含多样反应性亲电基团的共价遗传编码肽大环库
9. `10.1021/acs.joc.6c01604` — (±)-Hirsuteine、(±)-Hirsutine、(±)-Corynantheine和(±)-Dihydrocorynantheine的简洁全合成
10. `10.1021/acs.orglett.6c03365` — 电化学合成螺二烯酮并连续扩环构建稠合6–7–6三环

上述 10 篇均在 staging 中保存非占位中文标题、文章特定 `scopeAssessment`、实际来源证据、首遍结论及反向挑战结论。

## Deferred DOI

- `10.1002/anie.8666577` — *Cobalt‐Catalyzed [2σ+2π] Cycloaddition via Site‐Selective Capture of Bicyclobutane Diradical*。fresh compact 与 Wiley 官方摘要可确认 Co(II) 捕获 BCB 二自由基并与吲哚形成稠合 bicyclo[2.1.1]hexane，但未给出底物/产物范围或分离收率；首遍和 challenge 均保留 pending。下一步由既有 Tampermonkey/VPN Bridge 读取正文或 SI 范围。
- `10.31635/ccschem.026.202608262` — *Electrocatalytic Carbon Dioxide Reduction Coupled with Alcohol Oxidation*。自 2026-09-22 延续的 pending；仍缺醇底物、氧化产物、范围、分离收率与主要贡献证据。原日期、来源 review、已尝试页面和后续动作均已保留。

历史边界复核未被排查名单误删：`10.1021/acs.joc.6c01559` 与 `10.1002/anie.9519061` 继续 retain/include；`10.1021/acs.orglett.6c03499` 与 `10.1021/acs.orglett.6c03386` 继续 retain while pending。

## 范围依据与兼容性

- scope rules：`scope-2026-09-24-v1`
- scope file：`docs/literature-scope-contract.md`
- scope blob：`f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- corrections file：`audit/literature-scope-corrections.json`
- corrections blob：`040902a773f72057dff59de5c66d27f568984813`
- handoff commit：`8c99b5892d322fa5b80fd59b2b95a86fc00cf0a3`
- compact blob：`1d0904023af9b188ea1e797e4b8702712dff2cce`

scope contract 与 corrections 本槽未变化，但已重新读取并核对四项历史边界记录与本轮同类材料、能源、酶/机理和聚合边界候选；未无差别宣称重审全站。

## 机器审计

- literature-audit run：[36278434211](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36278434211)
- generatedAt：`2026-09-26T23:08:30.269Z`（北京时间 2026-09-27 07:08:30）
- snapshot commit：`8c99b5892d322fa5b80fd59b2b95a86fc00cf0a3`
- latest / compact 同代，两个 `summary.unresolved=56`，compact 完整数组长度为 56
- active journals：16 本，完全覆盖 canonical registry 与 activeFrom
- gallery DOI：614；source records：821
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=0`
- `closureCoverageAnomalies=5`
- `verifiedThrough` 继续保持 `2026-09-20`

出版社 sourceChecks 如实记录为 checked 0、blocked 6、unavailable 10；blocked/unavailable 候选计数保持未知，没有用机器健康冒充出版社实时实查。Wiley 官方页仅用于上述 Angew pending 的摘要核验。

## GitHub 质量门

最终 [prepublish gate run 36279271815](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36279271815) 成功，job `108507877159` 的以下步骤全部通过：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`
- 正式 review 转换预演
- 严格 release bundle
- snapshot freshness、完整候选分区、deferred backlog、一致性与中文标题检查

最终字段：`publicationReady=true`、`releaseStatus=ready_with_pending`、`reviewComplete=false`、`conversionValid=true`、`productionDataModified=false`。

## 提交链

- audit trigger：`6f91f4e34bb09fde309df6da365a079d907d5b68`
- machine snapshot：`8c99b5892d322fa5b80fd59b2b95a86fc00cf0a3`
- final staging：`0229c7331add198efc45c034f5d4fd8b92820efa`
- final staging blob：`843e5b1480282a6659950e39c3371100aa8e9c7d`
- state：`8899ae120674b99c3a7340dfc7e9444ad427870e`
- state blob：`791d6c682fc351008c6d42d56154d37dd88da636`

上一槽 post-release carry-forward DOI `10.1038/s41467-026-77948-5` 已在本槽 fresh compact 中逐篇审核并明确 exclude（神经科学研究）；没有把上一槽的 `sync_failed` 静默当作已闭环，也没有借本槽预发布审核更改已上线卡片。
