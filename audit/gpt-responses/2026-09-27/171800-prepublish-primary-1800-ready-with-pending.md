# Organic Synthesis Gallery 发布前主审核 — 2026-09-27 18:00

- 最终状态：`ready_with_pending`
- publication slot：`2026-09-27T18:00:00+08:00`
- reviewComplete：`false`
- publishableSubsetReady：`true`
- productionDataModified：`false`
- pagesDeploymentRequested：`false`
- mediaAcquisitionPerformed：`false`

## 权威规则与快照引用

- scopeRulesVersion：`scope-2026-09-24-v1`
- scope rules：`docs/literature-scope-contract.md`，blob `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- scope corrections：`audit/literature-scope-corrections.json`，blob `040902a773f72057dff59de5c66d27f568984813`
- canonical registry：`shared/literature-journals.js`，blob `57050105998284ccbf87b1a5fe513b256b648949`
- handoff commit：`295da86091c7b0ec6df19db03cf8d72130ec11d8`
- compact handoff：`audit/unresolved-latest.json`，blob `9882c6234c34605790d4d954852d7ab640e39171`
- latest blob：`e7c07d36c0cbfa29170a74fc65677a6908d4648d`
- generatedAt：`2026-09-27T09:06:41.436Z`（北京时间 17:06:41）

scope contract与corrections blob相对上一槽未变化；本轮仍重新读取相关scope-rechecks并核对4个历史边界条目与现行规则兼容，没有把未定案排查记录当作排除决定。

## 机器审计闭环

16:55 独立审计未形成当前槽快照，且没有同槽正常运行锁；因此只更新一次既有push bridge。GitHub Actions [literature audit run 36308284450](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36308284450)成功。

- active journals：16，全部来自canonical registry并按activeFrom执行
- galleryDois：624
- sourceRecords：828
- rawMissingFromGallery：688
- previouslyReviewedExcluded：680
- missingFromGallery / compact unresolved：8
- potentialGaps：6
- criticalSourceFailures：0
- sourceFamilyGaps：0
- sourceCoverageAnomalies：0
- closureCoverageAnomalies：5
- latest/compact generatedAt一致，两个summary.unresolved均为8，compact完整数组长度为8
- verifiedThrough保持`2026-09-20`；Nature Communications、JACS、Angew、ACS Catalysis、Organic Letters的closure深度警告不被用于推进closure

## 逐篇双遍审核

结果：8 reviewed，3 include，3 exclude，2 pending。

### 发布白名单

1. `10.1002/anie.3256942` — 催化剂控制的双环[1.1.0]丁烷发散式应变释放胺化与骨架重塑
2. `10.1002/anie.5772245` — 界面锰–氮化碳协同的单原子催化选择性光催化C–H氯化
3. `10.1002/anie.7450551` — 氟导向、氢键辅助消除反应立体控制合成(Z)-杂原子取代氟代烯烃

三篇均保存准确中文标题、文章特定`scopeAssessment`、实际摘要事实、首遍决定、反向challenge及challenge结论。未编造底物数量、收率或图表位置。

### 明确排除

1. `10.1002/anie.6128076` — 主要贡献为钱币金属氢硼酸盐配合物、CO₂/甲酸单体系反应与金属氢化物迁移机理；虽有Au甲酸盐与CO₂氢硼化，但缺少一般有机底物—产物范围。
2. `10.1002/anie.6529709` — 高电压锂电正极/电解液界面operando ATR-FUV与CEI形成机理；有EC/VC脱氢过程，但无一般制备路线。
3. `10.1002/anie.7902673` — 既有细胞穿透聚二硫化物的细胞摄取、膜重塑与解聚机理；涉及聚合物和动态二硫键交换，但没有新的聚合/单体/链架构控制方法。

### 证据待定

- `10.1002/anie.8666577`：真实Co(II)催化BCB/吲哚[2σ+2π]环加成已经确认；fresh摘要及既有Wiley官方摘要均未给出BCB/吲哚底物范围、分离产物或收率。保持原始日期`2026-09-26`，继续等待正文/SI。
- `10.31635/ccschem.026.202608262`：CCS Chemistry官方检索片段确认是CO₂还原与醇氧化耦合的paired electrolysis，但文章页/PDF取证返回403，仍缺醇底物、氧化产物、范围、分离收率和主要评价目标。保持原始日期`2026-09-22`及历史来源，不因越窗删除。

pendingReviewBacklog已按DOI合并，未覆盖原始日期、firstRecordedAt或sourceReview；下一补证槽记录为2026-09-28 08:00。

## 历史边界复核

- `10.1021/acs.joc.6c01559`：retain/include；多组分一锅法、多类胺/苯甲酰胺范围证据继续符合现行契约。
- `10.1002/anie.9519061`：retain/include；多个困难α-烯烃的真实聚合方法学继续符合现行契约。
- `10.1021/acs.orglett.6c03499`：retain while pending；缺捕获伙伴/产物范围与分离收率。
- `10.1021/acs.orglett.6c03386`：retain while pending；单一Chasmanine片段不标为全合成，仍需路线一般性与原日期证据。

## 出版社与机器来源状态

16本期刊均保留machineSourceHealth；出版社完整实时列表计数没有被机器健康冒充。publisher状态为0 checked、6 blocked、10 unavailable，candidateCount保持`null`。Angew逐篇证据来自fresh摘要及既有Wiley摘要复核；CCS Chemistry仅取得官方检索片段，正文/PDF仍受阻。

## 预发布质量门

首个staging提交`e4ff204f2f7b543766aa8a5b11d839f46cc2f3a3`的语义验证与readiness检查已通过，但因证据时间写晚于runner执行时刻，正式转换以`conversion_time_predates_input`正确fail-closed。校正时钟后的最终 [prepublish gate run 36308773719](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36308773719) 成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：success
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：success
- formal conversion preview：success
- strict release bundle：success
- publicationReady：true
- releaseStatus：`ready_with_pending`
- conversionValid：true
- publishableDois：3
- deferredDois：2
- blockers：[]
- productionDataModified：false

## 提交链

- audit trigger：`ebd66cf046424cdd0d0defad2cb9de0c8ee8e7e9`
- machine snapshot：`295da86091c7b0ec6df19db03cf8d72130ec11d8`
- staging initial：`e4ff204f2f7b543766aa8a5b11d839f46cc2f3a3`
- staging final：`99b174256f790b68e6cfe575868d2fc47f9dbd7a`
- staging blob：`5caf547d579fb80ce9cff6b3ade6a815ff3650a9`
- state：`67626860e88e3b27a5788403f2cd2d8f2e5a4b92`
- state blob：`cfa0288c7823114ecac12043d124647d1be485f2`

本任务没有新增生产卡片、修改public文献数据、写入媒体或请求Pages部署；三篇白名单仅在18:00固定发布事务中可被消费。
