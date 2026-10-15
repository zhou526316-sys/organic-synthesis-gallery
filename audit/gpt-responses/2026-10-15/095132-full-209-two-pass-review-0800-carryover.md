# Organic Synthesis Gallery — 2026-10-15 全量补审回报

北京时间：2026-10-15 09:51:32
任务：本次聊天中用户明确要求“必须审核完全”；以 main 唯一基线，对 10 月 15 日固定 08:00 槽审计后的 209 DOI 做一次性完整人工两遍范围核查。本报告是已发生的操作记录，不是自动化安排。

## 原因与结果

此前的临时补审只对209条候选中的17条完成判断，将192条原样保留为未审核，这是当次工作未完成，而非192条文献没有证据，更非192条正式pending。该缺口已经解决。

| 审核结果 | 实数 |
|---|---:|
| 精确同代compact DOI | 209 |
| 逐篇 first-pass + challenge 已记录 | 209 |
| 合格有机合成纳入结论 | 29 |
| 有证据范围排除 | 172 |
| 有文章特定证据/首次在线日期缺口的pending | 8 |
| 完全未审核 | **0** |

29项 include 的titleZh、reason、evidenceBasis、firstPassDecision、challengeDecision、challengeReason和五个scopeAssessment字段逐篇记录；172项 exclude 对实际标题及可取得摘要做反向挑战。对摘要确实缺失但题目清楚显示非化学合成、新闻、材料或生物研究的低边界风险项目明确标注证据层级，没有谎称读过全文。对仍不足以决定真实制备范围/首发时间的8项保留真实pending，未以模板伪造任何底物数或实验数据。

8项真实pending是：
1. `10.1021/acscatal.6c06572`——光酶[2+2]反应有高ee，但仍需独立有机底物矩阵及SI。
2. `10.1021/acs.orglett.6c04101`——TMPA电磺酰化机理主导摘要，需实际烯烃/磺酰化底物和产物范围。
3. `10.31635/ccschem.026.202608538`——碳硼烷区域选择B–H官能化，出版社正文此前403。
4. `10.1021/acs.joc.6c01296`——需要核实SNAr/环化的烟酰胺衍生底物和分离产物，而非凭单一起始物两种氮源推断一般性。
5. `10.1039/d6sc06226a`——SF5双环戊烷醇合成潜在符合范围，RSC摘要截断且首次在线日期未核。
6. `10.1039/d6sc05550h`——氮杂双环[4.1.1]辛烷制备潜在符合范围，RSC底物/日期缺失。
7. `10.1039/d6sc07058b`——氮自由基阳离子Lewis酸样催化是否有一般有机制备、首次在线日期待核。
8. `10.1039/d6sc06967c`——氮手性对映选择性控制的反应与日期缺失。

## 验证及可复现证据

- 成功机器审计：[Actions 38664760054](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38664760054)，同代 `2026-10-15T01:18:13.403Z`，latest blob `34da183f65eb5ee5f68312832a05214f3faeebf1`，compact blob `ae0c49d6213156abc2cbd0e38a2cb1ff6e2a43a6`，16活跃期刊，209唯一DOI；`criticalSourceFailures=0`、`sourceFamilyGaps=0`、`historicalCoverageLosses=0`，另外4 sourceCoverage、5 closureCoverage警告，29条出版社first-online日期待核。46条元数据标为10月16日的Science Advances论文不能被算成今日正式新增。
- 完整逐篇审核：[audit/prepublish-review-2026-10-15-0800.json](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-15-0800.json)，最终结果commit `1d117d1dc7a03df946ca69de933d6acb104259b7`；最终blob `a723ec3a5feb8eab0e0365ebd844060760461ac7`。初始全量决策提交 `b0973c41a8c8a91819d78633064df6ce50f6e9ba`；根据真正CI补充两个挑战理由和规范pending集合，最终`validate-prepublish-review.mjs --allow-deferred`通过并报告`failures=[]`。这是记录格式和完整性校验通过，不等于已经获得固定槽发布授权。
- 正式[GitHub预发布门禁 #38667686625](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38667686625)：完整handoff记录验证步骤成功；正式转换预览及严格 `--allow-deferred --require-ready` 检查未放行。其计算`recordValidationPassed=true`、`semanticReady=false`、`publicationReady=false`。快照09:18北京时间生成，晚于当天08:00-09:00技术宽限；用户授权的下一合法新增时刻仍是10月16日08:00。
- 已将29条include及全部文章特定证据承接至[协调状态](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/literature-update-state.json)中的`nextSlotPublicationBacklog[]`，并将全部8条证据pending（包含2条旧pending原始日期）保存在`pendingReviewBacklog[]`。最终状态更新commit `d1f054d9fc7de8bfa5b2f6645abf274520172976`，并保存了完整172条已审核排除在源审核文件中，不能自动误作生产正式排除清单。

## 生产边界与结论

**语义审核覆盖209/209条，未审=0；正式发表仍未授权**。这是两个不同的门槛。`status=incomplete_review`和`publicationReady=false`如实保留，因为8项实证或首次在线日期仍缺、正式08:00槽已结束且严格发布门禁不通过。今天没有新增或删除生产文章，没有修改Pages/TOC/PDF/媒体或任何定时任务，没有新增18:00或中午替代槽。已发布生产文献数仍为1087（上一正式scope-correction marker）。

完整用户回报原文：之前192条未审源于当次只审核17条，不属于192篇均证据不足。现已将209篇逐篇核对并提交GitHub：29纳入范围、172排除、8条真实补证，未审0；完整记录校验通过，但今天的发布时窗已过且严格发布许可未满足。29项仅承接次日08:00，绝不窗口外提前上架。
