# Organic Synthesis Gallery — 2026-10-12 当日收录完整性核验说明

时间：2026-10-12 08:49 Asia/Shanghai
聊天上下文：用户在确认当日正式上线 5 篇后追问“怎么确定实际符合收录呢？”
本响应仅提出可核验的发现/范围双闭环方案，不改变正式发布与定时任务，不触碰生产数据。

## 事实核对

要确定实际符合收录的文献数量，必须做到“来源查全 + 逐篇审准 + 漏项复核”。仅仅看到 GitHub 审核通过，或者当天新增 5 篇，并不能证明没有漏收。

读取仓库 `zhou526316-sys/organic-synthesis-gallery` main：
- `cloudflare/scripts/audit-literature.mjs` blob `814ae335a33ee7cda655b020a299878ef878f657`：以 Crossref online/published/created 多ISSN、OpenAlex 做并集；历史 `reviewedExclusions` 可直接从本轮候选排除。
- `audit/latest.json` blob `1c2c3aefb3944e4883b2cec7aecf65ef0d7bde96`：2026-09-19—2026-10-12 的扩展扫描覆盖2604条来源记录，其中2101条属于以前审核排除，只有20条进入本轮主审核，5 include、15 exclude；sourceCoverageAnomalies=4，closureCoverageAnomalies=1，verifiedThrough维持2026-09-18。
- `audit/prepublish-review-2026-10-12-0800.json` blob `8f08e59197f373b1a8d423d7df885bece952ac74`：16刊出版社目录实查为0 checked、11 blocked、5 unavailable。
- `audit/latest.json` 的 `byDate.2026-10-12` 只有1条候选、且历史已排除；5篇本批发布来自10月10—11日，不等于10月12日全天实际发文量。
- `audit/publication-release-state.json` 记录已正式上线这5个 DOI；网站交付记录全部可见，生产总卡片964。

这说明两种漏收可能：Crossref/OpenAlex暂未发现的DOI；以及因历史排除而未重新进入候选的误判DOI。“正式发布5篇”已证实，“应收刚好5篇”尚未被证实。

## 判断实际应收数的四道关口

1. **独立来源查全。** 按 `shared/literature-journals.js` 16刊及activeFrom，逐刊枚举出版社 online first / advance article / 当前目录的真实 DOI、首次发表日期，和 Crossref多ISSN online/published/created、OpenAlex、created/deposit及7天尾扫做去重并集。保存每刊出版社候选、两家API候选、并集、差集、页面证据、核验时间。出版社无法访问标记 `unknown/blocked`，绝不以 `0` 伪装查全。
2. **历史排除重新挑战。** 已排除的2101项无须每天全量重抓，但规则变化、摘要/正文补齐、元数据变化和独立出版社发现差异必须触发定向重审；高相关的材料/机理/聚合/酶化学排除要反向挑战，不能因为已在排除列表就永远不再检查。
3. **逐篇双遍学术认定。** 对每个未决 DOI 记录主要贡献、真实起始物到产物或键构建、分离/收率/系列/通用路线事实及来源、最有力的排除反例。全文/SI不足时记待核，不虚构证据。例：被排除的 `10.1002/anie.2052342`（电化学控制 Scholl 环化）有产物条件切换，应查正文/SI一般性后确认是否纯机理；不能直接据此认定该篇必收。另一排除 `10.1038/s41467-026-78648-w` 已在出版社正式摘要得到核对，主要是NRPS基因簇组装表达平台，尽管产出肽仍不自动构成有机合成方法，https://www.nature.com/articles/s41467-026-78648-w 。
4. **闭环而非宣称“找不到就是没有”。** 每刊输出候选总数、已入库、确认排除、真实pending、未审、来源不明、漏抓差集；全局无未审DOI、无未解释历史覆盖缺口、机器快照一致、出版社差集全部处理或明确未知，才给出“截至某时刻已闭合的应收数”。当天未结束及来源未闭合不能声称全天只有5篇。 `verifiedThrough` 还在9月18日，应继续后续日期回扫。已具证据合格的 DOI 仍严格按每日北京时间08:00唯一正式发布槽上线；后来补核合格的条目顺延下一个08:00，绝不在晚间加发。

## 结论

截至本次已查证数据：2026-10-12 08:00 批次正式发布5篇属实；严格意义上“实际符合收录仅5篇”尚无法被证明。应将状态显示为“已发布5，发现覆盖待闭环”，而不是“全部合格文献5篇”。本响应没有新改范围决定，也没有补发或部署。

相关文件：
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/latest.json
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/unresolved-latest.json
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-12-0800.json
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/publication-release-state.json
