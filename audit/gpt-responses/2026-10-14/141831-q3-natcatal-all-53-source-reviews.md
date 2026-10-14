# 第三季度历史回溯：Nature Catalysis 已知 Q3 来源 DOI 全部归类（本轮完整用户可见回复归档）

- 北京时间：2026-10-14T14:18:31 +08:00
- 任务上下文：本ChatGPT项目继续2026年Q3历史回溯，承接2026-10-14已完成PR #642、#648、#650及11,408条待审基线。
- main唯一生产基线，历史专用staging，不改动08:00唯一正式上新。
- 本轮合并代码与学术审查：[PR #652](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/652)，merge `9c6ad501eb8fceefe7de6811cf20b2e4e4c6b070`，six CI families green。
- 本轮实际季度复算：[staging-only run #38521183043](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38521183043)。
- 本轮真实汇总：[历史总追踪 Issue #498 update](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6162204714)。

## 本轮用户可见回复正文及科学证据

### Nature Catalysis 剩余24条：出版社核验结果

逐篇核对出版社的文章类型后，发现其中 **19条并非独立原创研究论文**，包括 News & Views、Research Highlight、Research Briefing、Comment 和勘误。这些记录需要保留 DOI 与原始论文的关联，但不应生成独立的有机合成文献卡片。原始出版社来源包括：
- https://www.nature.com/articles/s41929-026-01577-w
- https://www.nature.com/articles/s41929-026-01581-0
- https://www.nature.com/articles/s41929-026-01610-y
- https://www.nature.com/articles/s41929-026-01591-y

另外5篇属于正式标注为 Article 的原创研究，需要独立判断学术范围。其中最值得谨慎处理的是：
- **10.1038/s41929-026-01611-x**：酶促嘧啶骨架重构形成1,3,5-三嗪骨架。原文已有体外反应的LC–MS证据，但是否构成可推广的制备方法，仍需区别于生物合成途径发现。源：https://www.nature.com/articles/s41929-026-01611-x。
- **10.1038/s41929-026-01609-5**：等离子体与铜电极协同提高C₃+产物及醇类生成，并产生常规电解条件下未观察到的产物。这是实际化学转化，但不能把反应器性能数据直接等同于通用有机制备方法。源：https://www.nature.com/articles/s41929-026-01609-5。

对这24条分别保留出版社类型证据和学术判断，不把“非原创文章”与“原创但不属于收录范围”混为同一种排除理由。

### PR #652 已通过全部CI并合并

[PR #652：Nature Catalysis 剩余24条逐篇核验](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/652) 已通过六类 CI，合并提交为 [9c6ad50](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/9c6ad501eb8fceefe7de6811cf20b2e4e4c6b070)。

| 分类 | 篇数 |
|---|---:|
| 出版社确认的非原创条目 | 19 |
| 原创研究、范围审核排除 | 4 |
| 原创研究、证据待核 | 1 |
| 新增审核通过 | 0 |
| **本轮完成核验** | **24** |

其中 `10.1038/s41929-026-01611-x` 保留为新增证据待核论文，不能将已观察到的酶促骨架重构直接等同于具有通用制备能力的合成方法。

此次合并仍只是审核规则与证据记录，不是线上新增文献。接下来将通过原有 staging 工作流复算整个第三季度的真实计数。

### Q3复算成功：未完成候选再减少24条

[历史复算 #38521183043](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38521183043) 已成功，并已从 Git 重新读取同一代次的季度统计与审核队列。

- Q3未完成候选 **11,384**，上一轮11,408，本轮减少24条。
- 去重来源 DOI **12,286**，数量未变，无来源丢失。

| Q3指标 | 最新结果 |
|---|---:|
| 正式收录 | 820 |
| 历史审核通过、待08:00入库 | 25 |
| 用户明确排除（来源队列中） | 4 |
| 出版社非原创排除 | 24 |
| 原创研究学术范围排除 | 18 |
| 追加科学证据待核 | 2 |
| 原审核清单待核 | 2 |
| 来源完成窗口 | 192/192 |

新记录的两篇科学证据待核是 `10.1038/s41929-026-01608-6`（膦甲酸电合成）和 `10.1038/s41929-026-01611-x`（酶促三嗪骨架编辑）。它们独立于原审核清单的2篇待核。

正式收录数没有变化。**本次减少的是经过实际审核、已有结论的候选，不是简单关键词过滤或删除来源记录。**

### Nature Catalysis 已知Q3来源：53条全部完成分类

| 分类 | 7月 | 8月 | 9月 | 合计 |
|---|---:|---:|---:|---:|
| 正式收录 | 7 | 3 | 3 | 13 |
| 非原创条目 | 8 | 10 | 2 | 20 |
| 原创研究范围排除 | 6 | 7 | 5 | 18 |
| 原创研究证据待核 | 0 | 1 | 1 | 2 |
| **仍未审核** | **0** | **0** | **0** | **0** |
| 来源 DOI | 21 | 21 | 11 | 53 |

以上数字来自新生成的季度审计按期刊及月份重新汇总，53条全部对齐。

“完成分类”仅针对已经发现的53条 DOI；出版社在线优先与逐期目录的全量完整性仍是独立验收项目，不能据此宣布Nature Catalysis或16刊第三季度完全查全。

### 本轮最终审计与下一阶段边界

Git历史审计成功后再次回读：Q3源候选唯一DOI 12,286，未完成11,384；Nature Catalysis源候选53、已审核未完成0。数据来自同时刻 `2026-10-14T06:16:05.983Z`，即北京时间2026年10月14日14:16:05：
- staging `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob SHA `6b325c6e32511d1dac0e17c8a576cea8f3cd7a4b`；
- staging `audit/historical-staging/quarter-2026-q3-review-worklist.json` Git blob SHA `8e2c067f47fc46c8ced09853377adf142437fca8`；
- 原始 staging source state SHA `99bac92a5c965c395c4e0bae63df823a09fc646d`（未被复算更改）；
- 学术批准manifest SHA `1810870edb12c55356f935d12f910f3f7634b2f3`，历史累计116通过，25待翌日唯一08:00流程，无学术新批准；
- 主线仍是1,087正式文献、Q3正式820。

本轮19条非原创与5篇原创科学判断都附带逐篇出版社 DOI 类别与冻结来源根/哈希，审核并未因关键信息不可得伪造否定证据。已归类旧候选不进入每日Today/Hot/微信新文献，Q3历史仅toc_only，不抓正文图、SI、PDF；绝不更改既有唯一北京时间08:00发文槽或绕过学术双遍审核。

**仍未通过的独立门禁：** 16刊 Research逐期完整覆盖、网络出版优先日期交叉检验与Q3遗漏论文全面发现。已知source完成192/192不是全出版社issue Research关闭；`publisherIssueResearchReconciliationComplete=false`。下一阶段需对其他15刊按出版社 Research目录/在线优先逐期核验，继续从仍未完成的11,384条筛出有真正一般制备证据的原创论文。

历史追踪Issue #498的本轮评论已经写入并GET回读：
https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6162204714

## 实际Git文件变化

本轮 PR #652 增量包括：
- `audit/historical-reviewed/q3-natcatal-unfinished-24-source-proof.json`；
- `audit/historical-reviewed/q3-natcatal-nonoriginal-19-two-pass.json`；
- `audit/historical-scope-assessments/2026-10-14-natcatal-late-online-five.json`；
- `audit/historical-reviewed/q3-natcatal-late-online-five-source-proof.json`；
- `scripts/historical-q3-reconciliation.mjs`；
- `scripts/historical-q3-reviewed-scope-proof.mjs`；
- `scripts/test-historical-q3-natcatal-residual-24.mjs`；
- `.github/workflows/historical-q3-reviewed-scope-ci.yml`；
- `docs/historical-2026-q3-catchup-contract.md`。

All records main only for audit/code/docs, no new formal literature cards. No secrets stored.
