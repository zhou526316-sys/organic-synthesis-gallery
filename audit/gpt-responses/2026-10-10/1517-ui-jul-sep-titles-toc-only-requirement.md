# 界面优化／历史补录：7—9月标题核验和 TOC-only 规则

北京时间：2026-10-10 15:18:32 +08:00
来源：当前项目聊天“接续界面优化／历史文献回溯”
用户指令原文：“7-9的有些标题还待核验，7-9的不要加pdf，只要toc。”

## 本轮已执行

- 已修改**现有**自动化任务“Gallery 23点历史文献回溯”，每晚北京时间23:00不变；其提示词新增“标题待核验先查”和7—9月“toc_only、禁止新抓正文图/全文/PDF、不得新建PDF任务”规定；历史 DOI 即使在 10 月补入也不触发按新增日期定义的 2026-10-01+ 正常文献全媒体采集。23:00 仅准备审核与需求，Tampermonkey 仍为真实 TOC 获取的独立工作线。
- 历史补录不显示“新增”或计入今日新增/公众号；不影响现有07:05/07:35/08:00正式任务，也不在23:00入库。2026-07-01之前metadata_only；7—9月新补录显示官方TOC，卡片不新增PDF/正文图按钮；真正10月1日及以后正常新增媒体采集规则维持。已经合法收集的7—9月媒体文件及权限不删除或覆盖。
- 只读核对仓库当前 `main` 的 `public/papers.gz.b64` 和6份 JSON（total-synthesis/manual/final-audit/curated/automation/rolling）；gzip在内存解压，未改生产。基础 gzip 289 条7—9月记录有125条英文标题为null；7份静态文献来源合并后，7—9月唯一 DOI 为733，仍有83条缺英文标题（7月51、8月25、9月7；Organic Letters55、Nature Communications26、Nature Synthesis2）。此统计不包括客户端缓存、服务端运行时解析和实际线上逐 DOI 读回，故并非83个线上已核实缺图/缺标题；中文标题缺失另行处理，不能视作英文缺失。
- 83条具体 DOI 和输入文件 blob SHA 已保存为 [历史标题静态缺口清单](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/audit/historical-backfill-2300-architecture-review-20261010/audit/historical-backfill/2026-07-to-09-title-gaps-static-20261010.json)，本轮文件提交 `9830104c083192fc9bb5b9a363862aa2afb87101`。
- 对其中3篇通过Crossref真实DOI元数据完成第一来源标题确认（只是候选，尚需出版社/OpenAlex二次复核，不是生产修正）：
  - DOI `10.1021/acs.orglett.6c02216` — “Cobalt/Photoredox Dual-Catalyzed Alkylation of Indole with Unactivated Alkenes”。
  - DOI `10.1038/s44160-026-01106-4` — “β-Selective C(sp3)–H functionalization of alkyl boronates using photoredox catalysis”。
  - DOI `10.1038/s41467-026-77437-9` — “Zipper polydefluorination-monoborylation of perfluoroalkyl chains”。
  - 来源第一遍证据存为 [Crossref标题验证抽样](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/audit/historical-backfill-2300-architecture-review-20261010/audit/historical-backfill/2026-07-to-09-title-crossref-sample-20261010.json)，本轮文件提交 `d045c2ec5bd434d48d125aa048c77ea7cf3282b1`。

## 已发送的用户可见消息

“我会把 7—9 月的补录规则改为‘先核验标题，只补 TOC，不新增正文图或 PDF’。同时检查现有数据库中哪些论文仍显示‘正在核验标题’，避免只修改抓取规则却留下错误卡片。已存在的媒体文件不会因此被删除。”

“已将北京时间每天 **23:00 的历史回溯任务**更新为新规则：

- **2026 年 7 月 1 日至 9 月 30 日：优先核验缺失标题，媒体只补 TOC，不新增正文图或 PDF。**
- 2026 年 7 月 1 日以前：继续使用无图片、无 PDF 的轻量历史模式。
- 历史补录仍不显示‘新增’，不计入当天新增，也不影响每日 08:00 正常发布。

我还确认了你说的标题问题确实存在：仓库的基础文献数据 `papers.gz.b64` 中，7—9 月的 289 条记录里有 **125 条英文标题为空**，涉及 Nature Synthesis、Nature Catalysis、Nature Communications 和 Organic Letters 等期刊。

这 125 条是基础数据层面的缺口，不能直接等同于当前线上仍有 125 篇未核验，因为其他补充数据和运行时标题解析可能已经补齐其中一部分。”

“进一步按 DOI 合并基础数据与六份补充数据后，初步统计为：

| 7—9 月静态数据核查 | 数量 |
|---|---:|
| 去重后的文献记录 | 733 |
| 仍无有效英文标题 | **83** |
| 其中 Organic Letters | 55 |
| Nature Communications | 26 |
| Nature Synthesis | 2 |

这说明部分缺失标题已经在补充数据中解决，但仍存在明确的数据缺口。**83 篇是当前仓库静态数据的核查结果，不是已经完成线上逐篇复验后的最终数量。** 中文标题缺失也需要单独排查，不能与英文标题缺失混为一谈。

今晚的回溯任务已加入‘先核验现有标题，再处理新的历史漏收’这一优先级。”

## 最终准备发送的正文

更新已完成：**7—9月历史补录只补TOC、不新增PDF或正文图**；标题核验优先级已写入23:00任务，并保存了83条静态待核验DOI清单。Crossref已对其中三篇给出真实英文题名（尚须二次验证再修生产）。

要特别区分：**目前完成的是自动化规则与审计、并未修改正式网页的标题/媒体代码**。现有 `PROJECT_RULES.md` 仍按 `addedDate>=2026-10-01` 要求Tampermonkey访稿时全媒体尝试，历史7—9月即使10月补入也可能误进入PDF队列。生产实现必须先通过独立 `ingestionChannel=historical_backfill` + `mediaPolicy=toc_only` 分流，在正式准入/媒体队列/卡片按钮和回归测试所有入口隔离；此项尚未部署，不能谎称系统已在代码层面自动阻断。已存在PDF不删除。正式发布唯一08:00不变；23:00任务不能提前发布。

## 执行/风险边界

- 用户明确要求7—9月“不要加PDF，只要TOC”；不把这一新媒体策略扩展成删除已有PDF文件或收回用户授权。
- 仅修改既有23:00任务并写独立审计分支；没有修改main生产数据、前端、媒体控制器、PDF网关、GitHub Actions发布槽，不抢Tampermonkey/PDF并行工作。
- `PROJECT_RULES.md` 的10月新增依据 `addedDate`，该规则与历史补录的真实发表日期之间存在潜在冲突。只凭更改任务提示词不能阻止既有生产媒体代码的自动抓取；生产隔离仍待安全实施与验收。
- 英文标题缺失的来源必须逐DOI核对Crossref/OpenAlex/出版商，不能把Crossref元数据已找到当成网页已上线修复。
