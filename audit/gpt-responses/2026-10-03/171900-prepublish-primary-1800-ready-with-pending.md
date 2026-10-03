# Organic Synthesis Gallery 2026-10-03 18:00 发布前主审核

## 结论

- 状态：`ready_with_pending`
- fresh compact：15 篇，全部完成逐篇初审与反向挑战
- include：1
- exclude：8
- pending：6
- 可发布白名单：仅 `10.1038/s41467-026-77740-5`
- `reviewComplete=false`；单篇 pending 仅延后自身，不阻塞上述白名单
- 本轮未写生产卡片、未改媒体、未请求或触发 Pages 部署

## 发布白名单

1. `10.1038/s41467-026-77740-5` — **邻近驱动区域选择性肽双环化构建噬菌体展示库**
   - 主要贡献：以交联剂工具箱实现邻近驱动、区域选择性半胱氨酸肽双环化，并用于构建噬菌体展示双环肽库。
   - 制备转化：含半胱氨酸的线性/展示肽经硫醇反应性交联剂形成共价双环肽。
   - 一般性证据：Rice公开摘要明确称其为generalized and regioselective bicyclization method，并描述一组crosslinker toolkits和库尺度应用；Zenodo记录确认其对应已接收论文及PCK1/PCK2宏环数据。
   - 边界挑战：下游虽用于PD-1结合肽筛选，但核心是可迁移的化学成键/肽双环化制备平台，不是纯生医、表达优化或通路重编程。
   - 证据：[DOI](https://doi.org/10.1038/s41467-026-77740-5) · [Rice公开摘要](https://repository.rice.edu/server/api/core/bitstreams/bcc46f15-1a90-4e1e-b8e1-830946f3b81d/content) · [Zenodo数据记录](https://zenodo.org/records/17120890)

## 明确排除

1. `10.1021/jacs.6c12969`：氢化NdNiO₃的质子缺陷化学与功能氧化物器件调控；“dehydrogenation”作用于无机缺陷体系，不是可分离有机产物制备。
2. `10.1021/jacs.6c14037`：无机多磷酸盐荧光探针与成像/检测为主；探针制备未形成一般合成方法。
3. `10.1021/jacs.6c17238`：薄膜串联TTA四光子上转换与能量传递光物理。
4. `10.1021/jacs.6c13239`：双核Cr(III)配合物光吸收、磷光与上转换为主；摘要未给底物、产物、分离收率或一般光催化合成范围。
5. `10.1038/s41467-026-78364-5`：三维集成忆阻器/TFT与储备计算。
6. `10.1038/s41467-026-77973-4`：已有PCL嵌段共聚物片晶的结晶驱动自组装、热解组装与重构；不是聚合反应、单体或共价链架构控制方法。[Nature官方摘要](https://www.nature.com/articles/s41467-026-77973-4)
7. `10.1038/s41467-026-77088-w`：费米量子气体随机矩阵行为。
8. `10.1038/s41467-026-78416-w`：可穿戴机器人意愿控制与人机交互。

## 当前 compact pending

以下6项均保留原日期、最初来源review、尝试页面、evidenceNeeded和下一步；未因跨槽或访问受阻删除：

1. `10.1021/acscatal.6c06578`：缺ACS文章类型、摘要、原创反应实例、底物/产物范围与分离证据。
2. `10.31635/ccschem.026.202608090`：缺亚胺底物、产物、反应数量、分离收率及界面电场机理/制备方法主次证据。
3. `10.31635/ccschem.026.202607590`：已有“高度对映选择性合成”的索引片段，但仍缺起始物类别、产物系列、收率和可迁移性。
4. `10.31635/ccschem.026.202607612`：缺光控动态共价成键/交换的底物、产物及一般性范围。
5. `10.31635/ccschem.026.202607659`：缺环氧树脂升级转化的产物、键变化、分离/物料衡算和树脂范围。
6. `10.31635/ccschem.026.202608472`：缺咔唑电化学重构的起始物、骨架变化、范围与分离收率。

## 历史 pending 与范围复核

- 越窗但持续保留：`10.31635/ccschem.026.202608262`。仍缺醇底物、氧化产物、范围、分离收率及主要评价对象证据。
- 既有卡片继续 `retain_while_pending`：
  - `10.1021/acs.orglett.6c03499`
  - `10.1021/acs.orglett.6c03386`
  - `10.1021/acscatal.6c05520`
- `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`等历史retain项已按未变化规则重新核对兼容性。
- `10.1038/s44160-026-01164-8`继续保持既有`removed/deployed_verified`状态，未从旧树恢复。
- 本轮只做规则变化影响面与相关边界项复核，没有宣称全站重新排查。

## 范围与输入证据

- scope版本：`scope-2026-10-02-v1`
- scope文件：`docs/literature-scope-contract.md`
- scope blob：`d7e163da1167917d2d6e9b9ba4d070b46e6253e5`
- corrections文件：`audit/literature-scope-corrections.json`
- corrections blob：`4df5fb1fb5c25804846c70eee555e9ae798c5d99`
- handoff提交：`76560d6eeccbbebb1ef024e564a3d991416b0aff`
- latest blob：`5b726c84b8ee02cb568cbc420e95dca3157aead1`
- compact blob：`35d506522b24c7d134349e14f6888b7c5d963bb6`
- canonical registry blob：`57050105998284ccbf87b1a5fe513b256b648949`
- latest/compact同代：`2026-10-03T09:06:06.033Z`
- 两份summary.unresolved均为15，完整compact数组长度为15
- active期刊：16本，全部由canonical registry读取
- `verifiedThrough`保持`2026-09-20`

第一次刷新在`2026-10-03T09:04:14.522Z`显示16个来源族同时失败，按瞬时全源故障仅重试一次；未取消或重启健康运行。成功机器审计：[run 37111861797](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37111861797)。

成功快照统计：

- gallery DOI：779
- source records：773
- raw missing from gallery：619
- previously reviewed excluded：604
- unresolved / compact：15
- potential gaps：5
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=1`（CCS Chemistry）
- `closureCoverageAnomalies=5`
- `historicalCoverageLosses=0`
- `scopeCorrectionsPending=0`

每刊sourceChecks继续分开记录机器来源健康和出版社实查；出版社未形成可审计实时列表时，candidate计数保持`null`，没有把blocked/unavailable虚写为0。

## GitHub 预发布质量门

最终门禁：[run 37112406266](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37112406266)，job `111172719796`，结论`success`。

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- `recordValidationPassed=true`
- `semanticReady=true`
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- `releaseStatus=ready_with_pending`
- 正式转换预演：通过
- 严格发布包：通过
- `conversionValid=true`
- `productionDataModified=false`

首轮门禁run `37112336603`准确指出顶层`remainingUnresolved`误写为计数；已改为与6个pending完全一致的DOI数组并重跑全套门禁。该修正不改变任何逐篇决定。

## 写入与未执行事项

- staging最终提交：`32bbd3a816f37a6c9737156a471295f29984f2cd`
- staging blob：`e789f1c90a4534931005d3376137243ebaea4b36`
- state提交：`507f12f4cca40bd56ef2c2067d52679626e6b095`
- state中`pendingReviewBacklog=7`，`pendingScopeReviewBacklog=3`；均为合并更新，没有覆盖旧记录
- 08:00正式发布记录和生产SHA保持不变
- 未新增生产卡片、未改保留论文、未抓取OA图片、未改媒体、未触发Pages部署
