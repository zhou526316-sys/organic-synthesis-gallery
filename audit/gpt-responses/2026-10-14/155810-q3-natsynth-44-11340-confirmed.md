# 历史回溯续作 · Nature Synthesis 2026Q3 44篇 DOI 学术分类验收

- 北京时间记录：2026-10-14T15:58:10 +08:00
- 项目：抓取有机合成文献并持续更新网页
- 用户命令：“继续”
- Git主线：https://github.com/zhou526316-sys/organic-synthesis-gallery
- 唯一生产文献发布槽：北京时间08:00，不新增18:00，审核回溯不直接正式入库
- 代码及审核：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/654
- 合并提交：432219e63dfbe65e08ea15609302135c24469a6f
- 真实 staging-only 复算：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38531523452
- 总追踪：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6163681077

## 本轮提交前确认

逐一从 main 读取PROJECT_RULES.md、docs/literature-scope-contract.md与audit/literature-update-state.json，并复核历史staging季度报表、原manifest和正式目录。起始Q3 16刊去重来源DOI 12,286；正式Q3 820；111? 避免误改正式内容：原上轮未完成候选11,384。审核期间不访问生产D1，不抓历史正文图/SI/PDF，不改TOC，不越过08:00发布槽。

已核实 Nature Synthesis 2026Q3 来源记录63 DOI：已正式入库17，历史5篇非原创? 准确为原已核实的2篇非原创；44篇尚未学术分类。读取7—9月12条精确审稿来源分片，Crossref/OpenAlex双来源完整，来源Git SHA指纹归档。与已正式目录及历史正式审核清单无交叉冲突。

## 完整的本轮用户可见答复——第一部分

### 下一批：Nature Synthesis 第三季度历史核验

已重新读取 main 和历史来源队列。截至本轮开始，第三季度16刊仍有 **11,384条未完成审核或日期核验候选**；正式收录820篇，历史审核通过但尚未发布25篇。

这次优先处理 Nature Synthesis：其第三季度来源队列有63条不同 DOI，17篇已正式收录、2篇已有非原创审核记录，**剩余44条需要判断**。

初步出版社核验已经区分出几种容易误判的情况：
- `10.1038/s44160-026-01103-7` 虽然报道羧酸光电催化邻位二氯化，但它是 News & Views，真正的原创方法论文另有 DOI。
- `10.1038/s44160-026-01112-6` 是宋林等人的电化学交叉亲电偶联综述，不是新增原创实验论文。
- `10.1038/s44160-026-01115-3` 则是真正的原创 Article：通过两次选择性亚胺缩合，构筑含524个原子的分叉分子结。这篇需要认真判断其分子拓扑合成方法是否满足网站的通用制备标准，不能简单当成材料论文排除。

本轮还发现，2026年7—10月 Nature Synthesis **卷期月份与论文首次在线月份并不对应**。因此将继续以每篇文章的首次在线日期归属季度，不使用卷期日期替代。

### Nature Synthesis：44条候选已完成逐篇初审

本轮已核对出版社文章类型，并写入带 DOI 和来源指纹的审核记录。结果如下：

| 审核分类 | 篇数 |
|---|---:|
| 非原创文章（评论、综述、简报、勘误等） | 31 |
| 原创 Article，范围审核排除 | 11 |
| 原创 Article，制备证据待核 | 2 |
| **合计已审** | **44** |

两篇保留待核的原创研究分别为：

**`10.1038/s44160-026-01115-3`**：524原子的复杂分叉分子结。作者确实实现了新型共价拓扑结构的定向合成，但仍需确认这一策略能否拓展到其他分子结或前体体系。

**`10.1038/s44160-026-01146-w`**：香豆素连接的共价有机框架。这里存在真实的新共价连接反应，但目前证据更集中于光催化析氢性能，需进一步核实聚合反应本身的普适性。

31条非原创文章中，已逐篇记录对应的原始研究 DOI（能确定时）和出版社首发日期；不将新闻解读、研究简报或综述冒充新增方法学论文。

**以上是已写入审核分支的结论，尚未合并，也未计入正式Q3复算。** 接下来进行来源交叉校验和CI验收。

## 完整的本轮用户可见答复——第二部分

### PR #654 已通过全部CI并合并

[Nature Synthesis 第三季度44条文献审核 PR #654](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/654) 已通过六类CI并合并至 main。

合并提交：[432219e](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/432219e63dfbe65e08ea15609302135c24469a6f)。

本轮保存了31条非原创论文的出版社核验记录，以及13篇原创 Article 的学术双遍审核。13篇中11篇排除、2篇保留制备证据待核；**没有新增审核通过的收录论文**。

这次合并只更新历史审核记录与复算逻辑，未改动正式文献库、媒体或08:00发布流程。下一项验收是将44条结果纳入真实的Q3 staging复算。

### Nature Synthesis 季度复算成功：新增44条审核结论全部生效

[历史复算 #38531523452](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38531523452) 已成功。两份 staging 审计文件均生成于 **2026年10月14日北京时间15:55:41**，数据代次一致。

Q3未完成审核/日期核验 **11,340**，较上轮11,384减少44条；Q3去重来源DOI **12,286**，总量未变。

| 全季度指标 | 上轮 | 本轮 |
|---|---:|---:|
| 正式收录 | 820 | 820 |
| 已审待08:00入库 | 25 | 25 |
| 出版社非原创排除 | 24 | 55 |
| 原创研究范围排除 | 18 | 29 |
| 追加科学证据待核 | 2 | 4 |
| 未完成候选 | 11,384 | **11,340** |
| 来源完成窗口 | 192/192 | 192/192 |

Nature Synthesis 的 **63条已知Q3来源记录现已全部分类**：正式收录17篇、非原创33条、原创研究范围排除11篇、证据待核2篇，未审核为0。

这不是季度全量查全结论。**16刊出版社 Research 逐期完整性依然未通过最终验收**，但 Nature Synthesis 已知来源的审核状态已经完成闭环，且经真实 Git 审计回读确认。

## 本轮最终对话答复

本轮44条审核文件与 PR #654 的六类绿色CI，以及实际staging-only季度复算，都已经写入 Git 并回读。成果见 [本轮总追踪](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6163681077)。

下一刊 Nature Chemistry 只读候选清点得到 Q3 DOI 66条，其中13篇正式收录；余53条尚不能直接判定为漏收或超范围，将依据出版社 Research 与在线优先目录、个别论文真实制备证据逐篇核验。当前仍有11,340条跨16刊未完成候选；来源完成192/192不等于出版社全量闭环。

## 真实阶段验收快照

- 审核PR #654合并SHA `432219e63dfbe65e08ea15609302135c24469a6f`，六类CI success，未绕过测试。
- staging only run `38531523452`，success。
- `audit/historical-staging/quarter-2026-q3-coverage.json` blob `f6ef0e42b2726070fc1b4888710c859a2d8cde93`。
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` blob `f301f8914036a22a8e6d10650972c92a4d63ffb1`。
- both generatedAt `2026-10-14T07:55:41.007Z`（北京时间15:55:41）。
- 原始staging来源state SHA `99bac92a5c965c395c4e0bae63df823a09fc646d`，保持未改变。
- 原学术 `approved-admissions.json` SHA `1810870edb12c55356f935d12f910f3f7634b2f3`，原116通过、2旧pending/25待08:00入库未改。
- 主站 `public/toc-demand-live.json` SHA `af1aed70f4849c7a1fdd8f52d099b75bdae47435`，1087目录条；Q3 820正式条。
- 追加四条待核 Nature Catalysis C–P膦甲酸、酶促三嗪骨架编辑以及Nature Synthesis分叉分子结和香豆素COF；与原2篇manifest pending独立。
- 页面TOC/正文图/SI/PDF采集没有发起、正式目录无增量，用户永久排除清单未改，唯一08:00发布日程未变；无D1请求。16刊出版社 Research 和 Early View仍未最终验收。
