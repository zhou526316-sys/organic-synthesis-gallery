# Organic Synthesis Gallery — 2026Q3 历史回溯继续执行：本轮完整用户可见回报

北京时间 2026-10-13 21:16:43。聊天上下文：抓取有机合成文献并持续更新网页 / 用户连续“继续”。唯一正式生产基线 `main`；历史审核不替代北京市时间08:00唯一正式文献发布。

## 首先核查上轮遗留任务，不重复执行
- Nature Synthesis September/October issue 26 Research DOI reconciliation PR #602 已合并，commit `0d87fe9aee8bff49e7bac6441ba92dd6dfd2c825`，历史季度与站点CI均成功。
- 上轮6篇ACS审稿分支所含六DOI已被其它完成的历史审核线收入main，复核后未再次增加。
- 本轮开始时 `main`历史通过68、正式984/Q3正式743、既有日期冲突pending2。原Q3 staging为192/192根、12,286去重源DOI，未审或日期待核11,487，跨窗口日期冲突82。避免与开放中的Nature Synthesis 7–8月刊PR #612、Nature Catalysis 9月刊PR #608并发写同一文件。

## 本次完成且正式合并的6篇Q3 ACS原创合成论文
新 [PR #613](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/613) 基于ACS官方Article History首次在线日期、ACS公开摘要的真实底物—产物转化、各自Crossref/OpenAlex来源批次及其Git blob SHA，完成独立第一遍合成范围判定、独立第二遍对抗性范围核查、真实作者、卷期页码和准确中文题目。
| DOI | 首次在线 | 双遍学术审核结论 |
|---|---|---|
| `10.1021/acs.orglett.6c03383` | 2026-09-07 | 两种完成全合成：17-nor-excelsinidine、geissoschizoline；另有dehydrogeissoschizoline形式全合成，严格区分 |
| `10.1021/acs.joc.6c01571` | 2026-08-24 | knightol、knightal、knightol acetate三种天然产物全合成；farnesol起始、Shi环氧化和HWE大环化是关键证据 |
| `10.1021/acs.orglett.6c02567` | 2026-07-29 | Pd羰基化Negishi型苄基溴/烷基锌偶联，CO气体得到苄基烷基酮；非CO2羧化 |
| `10.1021/acs.joc.6c01578` | 2026-08-26 | 手性大环硼烷的无金属不对称喹啉氢化；2-烷基底物87–98%收率、79–96%ee，2-苯基选择性中等 |
| `10.1021/acscatal.6c03374` | 2026-07-16 | Rh/N-Tfs腙卡宾Si–H插入和外消旋硅中心氢硅烷动力学拆分，同时构筑C、Si手性；最高s=397非普适 |
| `10.1021/acs.orglett.6c02816` | 2026-09-02 | 偶氮吲哚+2-乙烯基吲哚不对称去芳构化逆电子需求偶氮Diels–Alder，最高94%收率、>99%ee及dr>20:1均是上限 |

本次CI四类全部 `success`：历史学术准入 [#38402282414](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38402282414)、Tampermonkey [#38402282389](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38402282389)、私人PDF回归 [#38402282458](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38402282458)、全站含Playwright [#38402282441](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38402282441)。确认全部通过后合并 `main`，commit [`5cd1bad8a9c298a24efd4730b23f28efb6ee95c9`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/5cd1bad8a9c298a24efd4730b23f28efb6ee95c9)。重新读取确认6篇在approved-admissions，均没有正式发布。

## 一篇新发现的ACS官方日期冲突，未放行
`10.1021/acs.orglett.6c03028` NHC催化氧化酯化/动态动力学拆分合成C–N轴手性酯，学术范围证据充分，但ACS两个官方入口显示相反 `Published Online`：DOI主路径为2026-07-31，期号Article History路径为2026-07-30。Crossref/OpenAlex原始阶段记录亦为2026-07-30。这三个来源日期不得自动裁决。
精确证据地址：
- https://pubs.acs.org/orlef7/article/doi/10.1021/acs.orglett.6c03028/5237535/Organocatalytic-Enantioselective-Synthesis-of-C-N
- https://pubs.acs.org/orlef7/article-abstract/28/32/10403/5237535
独立存为 `audit/historical-reviewed/2026-10-13-q3-orglett-6c03028-date-conflict-hold.json`。该条是新核实但**尚未纳入权威approved/pending manifest分区**的精确首发日held DOI，继续位于来源待审清单；不得冒充第三个正式pending或已审核通过。既有权威2个ACS日期争议保持不变。

## 真实季度复算，而非仅PR修改
基于`main`历史审核74通过与正式目录984篇，对原已有 staging-only 安全trigger做 GitHub SHA有条件更新 `089bc1bbe2744dce8c0f2fd8877dd76f976497a9`，未改23:40和08:00任务，也无新增18:00。实际 GitHub [#38403245408](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38403245408) **completed/success**。
读回 staging `audit/historical-staging/quarter-2026-q3-coverage.json`、`quarter-2026-q3-review-worklist.json`，两文件 `generatedAt=2026-10-13T13:13:45.920Z`（北京21:13:45）完全相同；结果：
- Crossref/OpenAlex来源窗口192/192完成，去重候选12,286（原始出现12,368，重复82）。
- API日期已知Q3来源候选11,372；原始发表日期未知或有歧义914，跨来源窗口日期冲突82；补审作者日期记录不会修改原始API来源文本。
- GitHub生产静态目录984篇，其中Q3正式743；正式Q3不存在本批六篇。
- 历史学术审核累计`checked=76`、`include=74`、权威 `pending=2`；此前已有历史正式入库8，**66篇审核通过尚未正式上网**，其中Q3待08入库60、7月1日前待入库6。
- 独立已审出版社非原创论文排除5，正式范围纠错在源Q3匹配4；两者分别统计。
- 未完成Q3学术审核或日期核验 **11,465**，上一轮staging快照11,487，减少22（此前已合并未刷新审核16 +本轮新增6），不是22篇由本次新审核创造的成果。
- 当前320条分页审核清单共36页；新日期争议 `10.1021/acs.orglett.6c03028` 仍在page0待审核，不自动排除。
- 出版社逐期Research目录核对仍`publisherIssueResearchReconciliationComplete=false`。192/192只是来源窗口完成，不能当作16刊整个Q3期刊目录或学术范围闭合；12,286和11,465都不是合格有机合成论文数量。

## 严格生产隔离与继续方向
本轮历史学术审稿仅写GitHub学术审核、测试及报告；Q3历史论文继续`toc_only`（只允许官方TOC），2026-07-01前`metadata_only`，不抓旧PDF/SI/正文图，不进入Today/Hot/公众号日报；不通过历史链路消耗Cloudflare生产D1或直接改正式卡片。正式收录下一次只有原北京时间08:00授权writer按锁与latest数据复核之后才能执行，CI通过/审核合并≠正式线上可见。
下一轮优先出版社逐期Article/Research DOI全集与online-first交叉对账、RSC官方首发日期证据、已审未上66篇的原08:00 writer严格验收以及剩余源候选双遍实质审核。1000篇/季仅为宽松召回预警，不是配额。

追踪已同步 [Issue #498 评论](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6146395036)。

## 用户可见答复衔接
本轮承接并核实上轮任务已合并/重复DOI，新增6篇独立双遍合成学术审核并以PR #613通过全部四类CI合并；另1篇C–N轴手性论文因两个ACS官方Published Online日期冲突保留独立held证据未入准入名单；安全staging复算成功，正式目录未变，候选遗留为11,465，权威历史通过74、待正式入库66。季度出版社目录完整性尚未验收。
