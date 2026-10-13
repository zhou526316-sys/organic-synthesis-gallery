# 历史回溯全面性核验与待批准修复方案

- 北京时间：2026-10-13 09:01:15
- 项目：抓取有机合成文献并持续更新网页 / Organic Synthesis Gallery
- 用户反馈：2026-10-13“历史回溯似乎并没有很全面，不可能只有这么点文献”
- 状态：已复核，问题成立；只读核验和证据存档，**未获本轮修复授权，未改程序/数据/发布任务**
- 基线：zhou526316-sys/organic-synthesis-gallery，main；历史源分支 staging/historical-archive-nightly

## 核查结论

用户的质疑成立。目前不是历史来源只有8篇，而是大量 Crossref/OpenAlex 候选已经写入 staging，真正完成独立双遍科学审核并进入正式检索的只是2026-10-13 08:00 首批8篇。生产 `audit/publication-release-state.json` 当日为979篇，`historicalAdmittedDois` 8篇；`public/toc-demand-live.json` 对应979 DOI 和8篇独立历史卡片。余7篇为该日常规新增。新历史补录不得计入 Today、Hot、WeChat 每日新增。

最新 staging 状态：279个期刊×日期完整根窗口，从2026-09回扫到2026-01，现处2026-01 Nature Communications，2个分片待继续；本轮请求220、处理27、`deferredBudget:true`、来源受阻 false。两个 scheduled 工作流分别为 #38316098728 实际采集成功、#38316810942 因去重而正确跳过。26个 RSC 已知 year-only 错误零结果重查均已完成，但不能当全16刊全历史覆盖。

## 实际候选积压证据

以下是独立源批次在采集时的快照；其 unfinished 状态不会随日后入库自动回写，不得当当前已审全量账本：

| 窗口 | 原始来源候选 | 当时已在正式库 | 当时待审核 |
| --- | ---: | ---: | ---: |
| 2026-03 JACS | 459 | 0 | 459 |
| 2026-03 Angew | 347 | 0 | 347 |
| 2026-03 JOC | 144 | 0 | 144 |
| 2026-03 ACS Catalysis | 179 | 0 | 179 |
| 2026-03 Nature Synthesis | 30 | 0 | 30 |
| 2026-06 JOC | 185 | 0 | 185 |

源批次为 `audit/historical-staging/batches/`，不同来源候选不可等同有机合成范围通过数量；JACS、Nature、Science 等还混合大量非方法学文章。

2026-09-08～09-14 JOC 来源批次：38条，按2026-10-13正式目录 DOI 集再比较，仅5篇已经正式入库、33条仍不在库。33条含2条期刊目录/主编名单等非文章记录，及可能需要排除的其他非有机方法学研究；但至少有明显的合成方法候选还没通过审核：

1. DOI 10.1021/acs.joc.6c01580，ACS 2026-09-14 发表，电化学溴化/氯化 α-oxo ketene dithioacetals，摘要明确28个产物、克级反应和制备适用性。出版商：https://pubs.acs.org/joceah/article/doi/10.1021/acs.joc.6c01580/5429221/Electricity-Driven-Halogenation-of-Oxo-Ketene
2. DOI 10.1021/acs.joc.6c01772，ACS 2026-09-11 发表，噻蒽鎓盐-亚膦酸酯光促进膦酰化，明确 C(sp3)-P 成键、底物拓展与后期修饰。出版商：https://pubs.acs.org/doi/10.1021/acs.joc.6c01772
3. DOI 10.1038/s44160-026-01023-6，Nature Synthesis 2026-03-04，光氧化还原催化吡啶芳基迁移，出版社正文显示多模式迁移、底物范围和10 mmol转化。https://www.nature.com/articles/s44160-026-01023-6
4. DOI 10.1021/acs.joc.5c02590，JOC 2026-03-18，钯催化多组分羰基化环化，ACS正式摘要确认底物范围和可放大性。https://pubs.acs.org/doi/10.1021/acs.joc.5c02590

以上为出版社有据的 **高置信度待审核候选**，不是本轮已形成正式 two-pass include，不得私自加主库或调用固定槽外发布。

## 已核实的系统性缺陷

1. **审核瓶颈**：当前审批清单仅10篇决策，8 include + 2 因ACS发表日期冲突 pending，远低于数百/批的候选发现速度；原有作者化审校不应以关键词自动排除代替独立双遍审核。
2. **时段覆盖远未完成**：只回溯至2026年1月，距离16刊自创刊相差数十年；当前 collector 采用固定1850-01-01 全局地板，正式 registry 没有历史创刊界限，不能拿 prospective activeFrom 充当创刊日期。
3. **来源策略不等于出版社目录完备**：Crossref journal pub-date + OpenAlex primary_location.issn 为主，RSC 的 year-only 发布日期曾产生实际假零；还须逐期与出版社目录核对并检查 created/deposit/date uncertainty，不能把无命中当完整。
4. **早期 DOI 覆盖缺口**：现有 `normDoi()` 要求注册 DOI，早期 DOI 不存在或无法分配的老论文从设计上无法表示，属于未来自创刊全覆盖的结构性边界。
5. **历史可检索元数据不足**：staging 原始摘要字段是 availability boolean，`storedText:false`；在无合法可展示摘要时难以实现用户期望的所有历史术语检索。许可核验和索引建设需独立进行。
6. **进度指标误导**：来源窗口完成数、候选数、通过双遍审核数、08正式入库数和实际 Archive/D1 可检索数必须独立对齐、区分，不能以流水线 success 代表完整归档。

## 待用户明确批准后建议分段实施（当前未实施）

A. 先在现有2026年7-9月和2026年1-6月已完成窗口中，以DOI及出版日期去重，建立有证据的 **高召回审核队列**：保留无法确定者为 pending/unfinished；关键词用于排序不可删样本；排除 issue masthead、erratum 等结构化非研究记录要留日志。
B. 历史双遍审核并行分小批推进，逐 DOI 保存 publisher date、scopeAssessment 的五个实际证据字段、挑战性第二遍和原始批次 SHA；首先复核9月8-14日 JOC 缺项，再按期刊和时间段覆盖全部已采完窗口。
C. 继续向前回溯直至各刊经出版社证实的真实创刊时段；建立与 prospectively activeFrom 分离的 historicalFoundedAt 及逐年期刊期数覆盖账本。来源查询有异常时保留缺口及分段重试，不得静默0；旧 DOI / 无 DOI 内容需另建来源可核验的稳定书目 ID 策略后讨论正式收录。
D. **只在每日北京时间08:00**由原固定 writer 吸收双遍同意的历史批准清单；发布 `ingestionChannel=historical_backfill`，不算Today/Hot/每日上新/公众号日报；7-9月 toc_only，7月前 metadata_only，禁止新抓旧文章正文图、SI、PDF。
E. 必须在 Pages/D1/Archive 真正回读 DOI 与中文英文检索后报告入库成功；发布每刊×月份或年份的来源总数、去重、明确排除、待审、审定、已入库、仍缺源，并核对加和闭合。

## 相关真实回执

- 固定正式入库：`audit/publication-release-state.json` 2026-10-13 08:00，979篇，其中8历史、7当日新增。
- 历史采集：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38316098728
- 去重的备用采集：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38316810942
- 已知综合 issue：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498
- 审核及发布合同：docs/literature-scope-contract.md、docs/historical-backfill-media-contract.md、scripts/historical-nightly-discovery.mjs

所有统计仅按2026-10-13此轮读取快照，不虚构已经实现的修复。报告状态：verified_feedback_waiting_owner_approval。
