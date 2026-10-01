# Organic Synthesis Gallery 18:00 发布前主审核回报

Beijing time: 2026-10-01T17:27:28+08:00
Context: scheduled prepublish primary review for the 2026-10-01 18:00 fixed publication slot.

## Final user-visible reply

本轮 18:00 发布前主审核已完成，状态为 `ready_with_pending`。60 篇 compact 候选全部完成逐篇双遍审核：15 include、40 exclude、5 pending。预发布质量门已通过；未修改生产卡片、标题翻译生产数据、TOC/媒体，也未触发 Pages 部署。

### 15 篇发布白名单

1. `10.1002/anie.6159381` — 双功能共底物实现苏氨酸脱氢酶驱动的化学酶法吡咯合成
2. `10.1021/acs.joc.6c01172` — 吲哚衍生物的化学发散合成：草酰吲哚源MBH碳酸酯与α-烯醇二硫代酯的[2+3]环化及后续分支转化
3. `10.1021/acs.orglett.6c03894` — 能量转移与电子转移协同的可见光诱导蒽衍生物去芳构化杂芳基化
4. `10.1002/anie.1701592` — 芳香Pummerer促进的噻唑与硼酸酯立体专一性交叉偶联
5. `10.1002/anie.8881851` — 红花抗血栓黄酮6-O-糖苷的组合生物合成
6. `10.1002/anie.8050538` — 炔烃二氟亚甲基化：高效合成烯丙基二氟化物
7. `10.1002/anie.7232174` — 受阻路易斯酸碱对实现聚乙烯高效氧化升级转化
8. `10.1002/anie.9277033` — 镍催化芳基、杂芳基和烯基卤化物对脂肪醛亚胺的对映选择性加成
9. `10.1002/anie.4613575` — 乙烯基连接共价有机框架孔壁官能化的一锅顺序催化通用方法
10. `10.1002/anie.4827662` — 酚衍生物经自由基1,4-芳基迁移光氧化还原转化为β-芳基丙酸
11. `10.1002/anie.7400940` — 稳定α-硝基氮杂环丙烷实现可控烯酮亚胺化学
12. `10.1002/anie.9826344` — 酰基转移酶AntB双底物广谱性的结构机制基础及天然产物后期多样化
13. `10.1021/acs.orglett.6c03424` — 黄酮电化学发散转化合成二氢黄酮醇与3-碘黄酮
14. `10.1021/acs.orglett.6c03671` — 银催化级联反应合成具有强抗肿瘤活性的吲哚并吡喃伪天然产物
15. `10.1021/acscatal.6c05520` — 高活性单膦配位钌催化剂实现无碱添加剂的非均相N-烷基化

### Pending 与边界复核

- `10.31635/ccschem.026.202608090`：缺亚胺底物、产物、范围、分离收率及电场催化主要贡献证据。
- `10.31635/ccschem.026.202607590`：缺对环芳烷关键成键、底物/环尺寸范围、收率与对映选择性证据。
- `10.31635/ccschem.026.202607612`：缺动态键、单体/网络范围及可逆成键或交换的制备证据。
- `10.31635/ccschem.026.202607659`：缺环氧树脂氧化–Cope 消除的产物、键变化、范围与物料衡算。
- `10.31635/ccschem.026.202608472`：缺咔唑电化学重构的起始物、产物、键变化、范围与分离收率。

早间 pending `10.1021/acscatal.6c05520` 本轮取得完整摘要后已解为 include：摘要明确胺与醇的无碱 N-烷基化、Ru1-1P 催化构型、TOF 323 h⁻¹及10次循环稳定性。越窗 `10.31635/ccschem.026.202608262` 继续保留 pending；`10.1021/acs.joc.6c01559`、`10.1002/anie.9519061` 继续 retain/include；`10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386` 继续保留既有卡片并等待范围补证。

### 审计与质量门

- 范围契约：`scope-2026-09-24-v1`；contract 与 corrections blob 均未变化，已重新核查旧结论兼容性。
- fresh snapshot：北京时间 2026-10-01 17:15:00；latest/compact 同代，16 本 active 期刊完整覆盖。
- gallery DOI：726；source records：781；compact unresolved：60。
- `criticalSourceFailures=0`，`sourceFamilyGaps=0`。
- `sourceCoverageAnomalies=2`（Nature、CCS Chemistry）；`closureCoverageAnomalies=7`。这些不阻塞已完成审核的 DOI 白名单，但 `verifiedThrough` 保持 `2026-09-20`。

[机器审计 run 36841135159](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36841135159)成功。

[预发布质量门 run 36842621094](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36842621094)成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- `conversionValid=true`，`publicationReady=true`，严格发布包通过
- `publishableDois=15`，`deferredDois=5`，`blockers=[]`
- `productionDataModified=false`

[最终预发布审核文件](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-01-1800.json) · [完整执行回报](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/gpt-responses/2026-10-01/172728-prepublish-primary-1800-ready-with-pending.md)

提交链：

- 审计触发：`a8b1c840091176e0d35d5d956ce258bfadbd8f2c`
- 机器快照：`f146016679102fff268db0e68ecabcb50049a2bc`
- staging 审核：`799d834c3e8a51562e3beeb2b18013a9da6ab65b`
- state：`07db6f97558449b2cf05da44ec2639ce888796b9`
