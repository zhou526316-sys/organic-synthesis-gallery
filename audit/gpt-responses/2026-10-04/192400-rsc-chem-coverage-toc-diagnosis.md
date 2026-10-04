# 2026-10-04 19:24 Asia/Shanghai — Chemical Science / Green Chemistry / Chem 覆盖与 TOC 诊断

用户问题：Chemical Science、Green Chemistry 为什么一篇都没有，Chem 为什么只有一篇，而且 TOC 没抓到。

结论：用户观察成立，不能解释成“这三本刊最近恰好没有符合范围的文章”。当前至少存在发现层覆盖缺口；Chem 还存在独立的 Tampermonkey 出版社页面启动/绑定失败。此次仅诊断和记录，未修改抓取代码、发现逻辑、媒体生产数据、期刊列表或定时任务。根据 PROJECT_RULES.md，需用户明确批准具体修复后再实施。

## 1. canonical registry 正常，不是期刊没加进去

main 核对时为 7fbc5c1d5e1b5d0e8a97666497a8184719d1ce4c。shared/literature-journals.js 明确包含：
- Chem，ISSN 2451-9294，activeFrom=2026-09-19；
- Chemical Science，ISSN 2041-6520 / 2041-6539，activeFrom=2026-09-19；
- Green Chemistry，ISSN 1463-9262 / 1463-9270，activeFrom=2026-09-19。
因此不是 journal registry 配置缺失。

当前生产补充数据的实际结果与用户看到的一致：
- Chem = 1；
- Chemical Science = 0；
- Green Chemistry = 0。
唯一 Chem 卡片为 10.1016/j.chempr.2026.103282，2026-10-02 加入。

## 2. Chemical Science / Green Chemistry 的 Crossref 原始抓取并非零，却在候选并集中变成零

当前 audit/latest.json blob=425fd8ef2807fc3894a3712b6bd50f57538c584c，generatedAt=2026-10-04T11:25:48.660Z。

sourceStats：
- Chemical Science:
  - Crossref online 0
  - published 0
  - created 38（两个 ISSN 均返回 38）
  - OpenAlex 0
  - 最终 byJournal.sourceRecords = 0
- Green Chemistry:
  - Crossref online 0
  - published 0
  - created 23（两个 ISSN 均返回 23）
  - OpenAlex 0
  - 最终 byJournal.sourceRecords = 0

所以“0”发生在 raw source → candidate universe 的转换之后，不是 API 完全没返回东西。

当前 cloudflare/scripts/audit-literature.mjs blob=38f121f9bed166f8bf9d96c5f19ca91a6a73f925。已定位两个机制问题：

1. fetchCrossref 对 online/published/created 三种模式都固定从 journalRescueStart 开始；本轮 rescueStart=2026-09-28，但 verifiedThrough catch-up 要求 startDate=2026-09-21。也就是说报告声称在 catch-up，但 Crossref 实际并没有把抓取窗口扩到 9 月 21 日。
2. created 模式得到记录后，候选日期仍取 published-online || published，不保存 createdDate 作为独立救援日期。进入 universe 时，有 published/online 日期但落在允许窗口之外的 created 记录会被删除；没有日期的 created 记录反而保留。
3. sourceCoverageAnomaly 只基于过滤后的 universe 统计。Chemical Science/Green Chemistry 最终 candidates=0，因此 raw-created=38/23 → union=0 的异常不会触发 coverageWarning。这使“请求成功但全部被日期逻辑过滤”看起来仍然健康。

现阶段可以确定这是覆盖检测漏洞；不能在没有逐条 raw Crossref 日期证据前把 38/23 全部称为应收的最近文章。

## 3. Chem 只有一篇，也不是完整出版社覆盖

当前 audit 对 Chem 统计：
- Crossref online 0
- published 1
- created 2
- OpenAlex 1
- union/sourceRecords 1

但出版社公开页面存在 2026-09-24 online 的 Chem research article：
10.1016/j.chempr.2026.103265
“Evolution from out-of-plane to in-plane metallo-annulenes: Theoretical investigations of putative planar transition metallo-annulenes”

该文在 activeFrom=2026-09-19 之后，理论上至少应该进入发现/审核层再依据范围排除或纳入；当前 latest universe 没有它。它本身是理论研究，最终很可能范围排除，但其缺席证明 Chem 的“一篇”不是完整候选覆盖。

根因与上面 catch-up/source query 窗口一致：本轮 effectiveStart=2026-09-21，但 Crossref 查询仍从 rescueStart=2026-09-28 开始，9/21–9/27 的 online/published 文献如果没有更晚 created/deposit 事件，就可能完全漏过。

公开来源：https://www.sciencedirect.com/science/article/pii/S2451929426003311

## 4. Chem 的 TOC 没抓到：不是没进入队列，而是出版社任务页没有成功启动绑定

public/toc-demand-live.json blob=8949dc09e40c38dd0977a8d1914cb4ca7c2d0846：
- 10.1016/j.chempr.2026.103282 已在 articles；
- visibleGaps state=no_visual；
- allMissingOfficial 中也有它；
- figureCount=0。

所以队列生成没有漏掉 Chem 这篇。

读取 2026-10-04 的只读 Tampermonkey 诊断 run 37171310776 / artifact 11291531366，Chem DOI 的真实最新报告为：
- captureVersion 6.2.20
- controllerRevision 2.2.39
- mediaNeed=toc+figures+evidence
- publisher=elsevier
- status=failed
- reason=bound_publisher_heartbeat_missing
- tocStatus 空
- figuresDiscovered=0
- figuresStored=0
- evidenceChars=0
- articleUrl/sourceUrl/pageTitle 均为空
- 运行约 60 秒后 controller 失败

这证明它没有进入“已经找到图片但质量/角色不合格”的阶段，而是在控制器→出版社页的启动/绑定阶段就失败了。

当前 public/toc-mainline.user.js 已包含 ScienceDirect / Cell 的 @match，也识别 10.1016 为 elsevier；但 articleUrl() 没有 Elsevier 专用直达分支，10.1016 默认从 https://doi.org/<doi> 打开并依赖跳转。publisherBoot() 在 doi.org 上主动 return，只有最终落到已 @match 的出版社页面后才会写 heartbeat。中间重定向域、最终页面加载/脚本注入链是首要核查方向，但目前没有独立证据证明某一个具体 Elsevier 中间域就是根因，不能把这个猜测当成定案。

## 5. Chemical Science / Green Chemistry 为什么也没有 TOC

目前它们没有生产卡片，因此 public/toc-demand-live.json 没有对应文献任务。Tampermonkey 只处理 Gallery 当前文献集合的缺媒体项，所以发现层没把文章送进审核/生产，媒体层自然无从抓 TOC。

RSC 适配本身并非完全缺失：userscript 有 pubs.rsc.org @match，10.1039 DOI 会识别为 rsc，并构造 articlelanding URL。应先修发现层覆盖，再用真正进入 Gallery 的 RSC DOI验证该适配器，而不是用“当前0卡片”推导 RSC TOC 适配器已经正常或已经失败。

## 6. broader TOC 状态：也存在“抓到了但没有显示”的另一类问题

已有只读诊断 audit/media-diagnostics/2026-10-04-acquisition-versus-publication.md 记录：最近59篇新增卡片中48篇已有官方TOC采集记录，但静态索引只显示21篇；19篇被标为 invalid_static_media_pruned，另8篇的采集时间晚于静态快照。也就是说整个站的“没看到TOC”不能一概解释成 Tampermonkey 没抓到。

Chem 这篇是另一类：真实报告显示 publisher heartbeat 根本没有建立。

## 建议修复范围（等待用户明确批准）

A. 发现层
1. Crossref 抓取窗口真正使用 min(catchupStart, rescueStart)，verifiedThrough catch-up 不能只写进报告、不扩大查询。
2. 独立保留 created/deposit date 与 published-online/published date；created救援发现的 DOI 遇到日期冲突时进入 date-conflict / date-unverified 待核验，而不是静默丢弃。
3. 增加 raw_to_union_collapse 守卫：某刊 raw created/online/published 有明显非零结果而 post-filter union=0 时必须报告 sourceCoverageAnomaly，并阻止对应日期 closure/verifiedThrough。
4. 对 Chem、Chemical Science、Green Chemistry 进行 activeFrom 以来的受控补扫，逐 DOI 去重并走正常审核；不直接批量纳入。

B. 媒体层
5. 针对 Elsevier/Cell 核实 DOI 跳转链和 Tampermonkey 注入点，确保任务页在 60 秒前写 bound heartbeat；只有证据确认后才扩 @match 或改直达 URL。
6. 修复后先用 10.1016/j.chempr.2026.103282 做单 DOI 验收：page DOI/title 绑定正确、official TOC 角色正确、正文图/文字证据独立记录。
7. 保持严格 DOI 身份验证；不得用随机 Figure 1 伪装官方 TOC；TOC 缺失仍不阻塞正确文献卡片。

本轮没有修改上述代码或媒体数据；这是 PROJECT_RULES.md 要求的“先核实、用户决定”阶段。

相关运行/文件：
- 当前 main：7fbc5c1d5e1b5d0e8a97666497a8184719d1ce4c
- audit/latest.json blob：425fd8ef2807fc3894a3712b6bd50f57538c584c
- public/toc-demand-live.json blob：8949dc09e40c38dd0977a8d1914cb4ca7c2d0846
- Tampermonkey 只读诊断：run 37171310776，artifact 11291531366
- 既有媒体诊断：audit/media-diagnostics/2026-10-04-acquisition-versus-publication.md
