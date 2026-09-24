# Organic Synthesis Gallery 2026-09-24 18:00 发布前主审核

本轮发布前主审核已完成，最终状态为 `ready_with_pending`。fresh compact 的 41 篇候选已全部逐篇双遍审核：9 篇 include、30 篇 exclude、2 篇 pending；`unfinishedHandoffDois=[]`。9 篇已形成显式发布白名单，2 篇仅延后自身。没有修改生产文献、TOC/正文媒体，也没有请求 Pages 部署。

## 权威范围与机器快照

- 范围契约：`scope-2026-09-24-v1`
- scope 文件/blob：`docs/literature-scope-contract.md` / `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- corrections 文件/blob：`audit/literature-scope-corrections.json` / `040902a773f72057dff59de5c66d27f568984813`
- fresh audit generatedAt：`2026-09-24T09:10:17.928Z`（北京时间 17:10:17）
- handoff commit/blob：`4069131ff4fb4d8e24e3dd0b0360e1654ef4fe71` / `8ba092dab22861b27d77e5bb1757de4a269d0579`
- latest blob：`5b397f604f545792e7a9a99c7eed76612644ef83`
- 机器审计：gallery DOI 557、source records 565、compact unresolved 41
- 健康度：`criticalSourceFailures=0`、`sourceFamilyGaps=0`、`historicalCoverageLosses=0`
- 告警：`sourceCoverageAnomalies=2`（Nature、CCS Chemistry），`closureCoverageAnomalies=8`
- `verifiedThrough` 保持 `2026-09-20`，未跨越 pending 或覆盖告警

16:55 没有可消费的新快照且无同槽活动锁，因此按协议经 push bridge 补触发。机器审计 run 35979373318 成功，latest/compact 同代，两份 summary 的 unresolved 都为 41，等于完整 compact 数组长度，16 本 active 期刊均覆盖。

## 9 篇发布白名单

1. `10.1021/jacs.6c16625` — 双硼删除环化：模块化构建具有增强手性光学性质的手性非交替B,N-螺烯
2. `10.1021/acs.joc.6c01939` — HFIP辅助的烯胺酮与酚电化学环化：选择性合成7-芳氧基和5-羟基苯并呋喃
3. `10.1021/acs.joc.6c01846` — 可见光诱导亚甲基环丙烷立体选择性自由基1,3-碘磺酰化
4. `10.1021/acs.orglett.6c03443` — 具有非生物水杨醛位点的人工酶设计实现甘氨酸酯生物催化活化
5. `10.1021/acs.orglett.6c02955` — Rh催化芳香酸与氧杂双环烯烃[3+2]级联环化：直接构建平面苯并[a]芴酮
6. `10.1002/anie.3415969` — 稳定油/水/固三相界面反应器中的电有机合成
7. `10.1002/anie.5648702` — 金属-有机框架限域铁钳形配合物高效选择性催化甲烷和乙烷硼化
8. `10.1002/anie.9855820` — D₂O中经异裂模式实现苄位C(sp³)–H键的可见光诱导氘代
9. `10.1021/acs.orglett.6c03851` — 金黄色葡萄球菌CP8两性离子三糖重复单元的全合成

每篇 include 均保存中文标题、文章特定 `scopeAssessment`、实际取得的 sourceEvidence、first pass 与 boundary challenge。30 篇 exclude 同样完成第二遍反向挑战；高相关边界项未凭标题关键词作决定。

## Pending 与历史边界复核

- `10.1038/s41467-026-78015-9`：fresh compact 仍无摘要；需要宏环/客体变化、可重复固–气组装范围及可迁移聚合物架构控制证据。
- `10.31635/ccschem.026.202608262`：fresh compact 仍无摘要；需要醇底物、氧化产物、范围及分离/制备证据，以区分一般配对有机电合成与能源/电极性能研究。

两条均保留原日期、首次记录时间、来源 review、已尝试页面与 nextAction，并合并进 `pendingReviewBacklog`，未被新槽记录覆盖。

历史边界复核结果：

- `10.1021/acs.joc.6c01559`：retain/include
- `10.1002/anie.9519061`：retain/include
- `10.1021/acs.orglett.6c03499`：继续 pending/retain
- `10.1021/acs.orglett.6c03386`：继续 pending/retain，未误标为全合成

4 条明确 scope corrections 已复用最终决定；没有借纠错新增或修改保留论文，也没有执行下线事务。

## 来源检查与质量门

出版社实时列表检查如实记录为 0 checked、6 blocked、10 unavailable，candidateCount 保持 unknown/null；机器 source health 与出版社实查分开记录。

最终 staging blob `341ce72e85285dfb50be5a253458e5744c83d112` 对应的 GitHub prepublish gate run 35980675436（#41）成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：成功
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：成功
- `recordValidationPassed=true`
- `semanticReady=true`
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- `releaseStatus=ready_with_pending`
- `conversionValid=true`
- `blockers=[]`
- 严格发布包构建成功，`productionDataModified=false`

state 提交附带触发的生产级通用 quality gate run 35981101385 仍读取 08:00 正式 review；因 18:00 staging 尚未在固定槽转换为正式 review，它按预期报告“unresolved 尚非正式 pending/已发布 next-slot carryover”。这不是 staging prepublish gate 的失败，也没有触发生产写入。

## 提交链

- audit trigger：`92c00db4c31f588d42195bc8068c722d581b49c8`
- fresh snapshot：`4069131ff4fb4d8e24e3dd0b0360e1654ef4fe71`
- staging 初稿：`1bdd865563292d926da5367e597df7c94b778754`
- 时间戳修正：`65737770dfe7bc28c3f22639af7d24896ce236e4`
- 最终 gate 元数据：`1b7666fdd57ea6475b40723e4c85f1bf1f7fdc09`
- state：`1b33591e7972251979e04f6688762b5304bce3eb`
- 本回报同步：本文件所在提交

最终 staging：`audit/prepublish-review-2026-09-24-1800.json`。自动任务保持原状，未停用、改期或新增。
