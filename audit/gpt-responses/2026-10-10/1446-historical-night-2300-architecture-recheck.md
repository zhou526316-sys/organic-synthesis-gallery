# Organic Synthesis Gallery：历史文献 23:00 回溯任务与架构复审

北京时间：2026-10-10 14:46 左右
对话：界面优化／历史文献收录与学术搜索
权威仓库：zhou526316-sys/organic-synthesis-gallery，main 最新只读基线 dd432612f2e742f071d0e8b3154801856fca77e6。
执行事实：已经创建并启用了北京时间每天 23:00 的独立定时任务；首次计划 2026-10-10 23:00。既有每日 07:05、07:35、08:00 工作未变更。该任务先做历史候选收集、证据和审核 staging，不授权夜间正式上线。
当前缺口：现有 main 下没有专门用于“16 期刊自创刊历史论文”的已验收 nightly 历史回溯 collector / workflow。因此“夜间定时任务成功创建”不能等价于已具备大规模自动抓取、审核和安全正式入库功能。第一轮必须给真实执行结果；无采集能力明确报告阻塞，不得虚报完成。

## 复核的代码事实

- shared/literature-journals.js 当前为 16 本期刊，按 2026-07-01、2026-09-19、2026-09-22、2026-10-01 设置 prospective activeFrom，严禁通过直接移除这些字段绕过现有正式发布契约。
- docs/literature-update-protocol.md、docs/publication-release-contract.md、architecture/CURRENT-CONTRACT.md：唯一正式新文献准入为北京时间每日 08:00，无 18:00 新增。TOC/PDF媒体由独立 Tampermonkey 负责。前端 Hot 为近三个月、Archive 为旧论文、D1 FTS 索引生产启用，分页桌面 24 / 手机 12。
- src/main.ts 与 shared/literature-policy.js：`isNewToday` 现在依赖 `addedDate`，而所有普通卡片默认附带 TOC、正文图、PDF 组件；必须扩展显示和队列边界，不能只隐藏“新增”角标。shared/literature-landing.mjs 中“发表日期未知且最近入库”的 Hot 显示兼容规则，也必须显式排除历史来源。
- cloudflare/worker/src/literature-catalog-index.js：D1 的 FTS5 trigram `searchableText` 只包含 DOI、英/中文标题、作者、期刊、首次在线日期、合成类型，不含摘要或化学主题，查询排序默认是发表时间而非化学相关性；`Ni`/`Ce` 等短词仍走兼容检索。
- Crossref 官方于 2026-08-24 调整 cursor 行为：每次请求必须带回完整的初始参数，并使用前一响应的新 `next-cursor`；游标页结果不是绝对快照稳定；不要用 cursor 结合 issued / published / published-online 等字段排序，分片并核对 `total-count`。参考：https://community.crossref.org/t/changes-to-cursors-filtering-and-sorting-in-the-rest-api/16246 及 https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api
- OpenAlex 有日期过滤及 cursor 分页；免费 API key 的日度预算有限，不能因为历史回溯挤占正常 08:00 更新任务；单条 DOI 验证优先，公开批量查询控制速率。https://help.openalex.org/api/paging/ 和 https://help.openalex.org/access/example-costs/
- Crossref 书目元数据可以重新利用，但原始摘要仍可能受著作权保护；官方摘要是否允许全文公开须逐来源记录。https://www.crossref.org/documentation/retrieve-metadata/
- 国内现行参考文献标准：GB/T 7714—2025，自 2026-07-01 实施。https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=C6CE52E55AC09B9C79A20AEA77CEDD14

## 必须落实的改进：经复核后的执行契约建议

1. **独立来源/准入，而不仅是不同日期。** 每篇 `ingestionChannel=historical_backfill`，存储 `originalPublicationDate`、`datePrecision`、`backfilledAt`、`sourceUrl`，并设置 `mediaPolicy=metadata_only`。默认首页 Hot、仅新增、今日上新数量、公众号每日统计、TOC/Figure/PDF 队列全部排除历史来源；全库搜索与期刊/年份筛选能找到。此规则覆盖所有历史回填（包括后来加入期刊在 2026-07-01 至 activeFrom 之间的漏档），不是只以某个发表日期猜测来源。
2. **区分“抓到候选”和“科学上纳入”。** DOI 候选可以大批获取，但必须按 docs/literature-scope-contract.md 二次证据挑战完成 `include/exclude/pending`；尚未审阅的是 `unfinished`。关键词仅用于优先级，不能预先硬过滤全期刊候选；最终收录主线仍遵循主要制备贡献、通用性和全合成证据。
3. **真正覆盖创刊以来的馆藏，不能只要 DOI。** 极早期可能没有 DOI 或元数据。建立 `bibliographicLegacyId` (期刊标识＋卷期页/年＋题名校验) 与可靠 publisher archive link；页面如实显示“DOI 未注册/未查得”与真实原始链接，不能虚构 DOI。期刊旧名、不同语言版、印刷版与电子 ISSN 的跨时期映射也要列入覆盖审计。
4. **摘要、引文、学术检索采用分层存储。** 轻量卡片仅展示标题、作者、期刊/年份、真实 DOI（存在时），展开按需加载`abstract`、中英研究概要、原文来源、卷期页、文章编号、出版社 URL、Crossmark、引用记录。记录 `abstractSource`、`abstractLanguage`、`rightsStatus`，无公开转载许可只展示合法链接/独立概述，不直接公开原始受限摘要；缺失时标记“摘要暂缺”，不凭标题编造。
5. **搜索从字面命中提升为可解释的化学概念检索。** 检索英文题名、许可范围内的摘要与人工/模型证据验证过的化学主题字段；中英词表覆盖 LMCT、CPA、轴手性、epoxidation、氧化环化、Ce/Ni/Cu 等，区分严格同义词与相关概念。优先精确 DOI/标题、主要主题命中、摘要命中，再到次要涉及；展示“为什么命中”，支持按相关性、年代、期刊、反应类型、催化金属筛选；长文本全文索引与两字符关键字都需独立测量性能。
6. **可引用而不是只生成表面像样的格式。** 规范保存所有作者及顺序、期刊名和 ISO4 缩写、年份、卷、期、页或 article number、DOI、online/issue 更新事件；ACS/JACS、Angew、Nature 与 GB/T 7714—2025 格式必须基于经核对的字段，提供 BibTeX/RIS/CSL JSON/Zotero 导出。期号页码缺失时不捏造。
7. **完整度实证：分片游标、跨来源比对和补漏。** 作业单元是（期刊/历史刊名×时间窗），逐页持久化查询参数、cursor、Crossref总数与实际唯一 DOI 数、OpenAlex 对照数、源失败及已审核比例；源故障、429、未遍历完、DOI/日期不一致时当前月份标记 `incomplete`，不能因抓到若干相关论文就声明“本月全部收齐”。已经审核通过的 DOI 不重复审核；定期补扫。
8. **按真实候选量伸缩，而不是机械半年。** 初次仅少量期刊月份做端到端试点，成熟后每晚可抓多个（期刊×1-2月）单元；古老稀疏年份可增至半年，现代高产月份应缩短。每轮有短任务超时上限、API调用预算、恢复检查点。11pm 夜间元数据采集不影响 08:00 Crossref/OpenAlex 预算与晨间作业。无额外固定付费。
9. **严格发布边界。** 即使 nightly staging 已审核完，也不在 23:00 更新生产文献/日更计数或部署；必须先经过独立历史准入发布门禁、与正常 08:00 唯一发布原子事务兼容、QA证明数据/搜索/新文献统计分离，再允许在后续 08:00 入库。不能用旧的 prospective activeFrom 修改来偷渡历史，不能把历史 DOI 混入 Tampermonkey。
10. **验收与透明度。** 使用六组代表性查询（LMCT、手性磷酸、轴手性、环氧化、铈催化、氧化环化）及已知正负样本验证双语召回、误命中和排序；核对标准引用正确率、资料权限、历史未混入新增、图片不入队、移动端国内网络加载速度。提供公开历史覆盖仪表（已遍历年份/期刊，候选/正式收录/待审/缺摘要/无 DOI/来源中断）与审计记录，而不是承诺“所有文献已经完整”。
11. **未来功能排优先级。** 第一阶段完成历史 DOIs/抽象、引文准确与检索，第二阶段建引用关系/作者消歧/检索订阅，第三阶段才评估复杂反应结构/SMILES/SMARTS 和相似研究对比，不在无底层结构数据时宣称化学结构搜索可用。

## 目前完成与未完成

已完成：1）已核对现有 16 刊、activeFrom、D1 FTS字段、前端新增逻辑与保护规则；2）23:00 北京时间独立定时任务建立并生效；3）这次审计记录持续化。
未完成：1）历史专用数据写入/采集器的真实生产级实现、测试与启用；2）从创刊到 2026 年的历史实际扫库；3）历史来源隔离生产部署；4）化学概念搜索/摘要/引文 UI 功能实现；5）任意历史论文正式上架。第一晚必须以真实采集到的候选和证据回执为准，失败时报告 blocked_no_runner 或 source_blocked；绝不能把定时任务“启动成功”当作抓取成功。

沟通约束：本记录是审计与设计，不隐含获批修改现有主发布链；不停止、不更新每日正式发布任务；不把历史文献排入新增；不新增付费服务。
