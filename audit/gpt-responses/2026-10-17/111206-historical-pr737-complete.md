# 历史回溯续作｜PR #737 完成验收与合并

北京时间：2026-10-17T11:12:06+08:00
对话上下文：用户“继续”“连接已中断，正在等待完整答复”，要求承接 Organic Synthesis Gallery 历史回溯。
学术审核 PR #735：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/735
PR #735 14篇唯一 DOI 汇总成功，合并SHA 62925cd4196d910a6cd7cf5699870a6fd894af61；#730 与 #732 原始并行审稿保留证据后关闭，未重复合并。

本次新学术审核 PR #737：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/737
PR #737 精确工作头 SHA c9c606ce441177af01a6adfe135606329f6c718d
合并 SHA 22c50581a660dde2024e753970ad1e7c00179e9a
Git commit 网址：https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/22c50581a660dde2024e753970ad1e7c00179e9a

## 分阶段用户答复主要内容

已经重新核查最新 main、staging、正常08:00正式入库。2026年10月17日08:00已有正式历史文献253篇，前一日122篇；全站正式1337篇。上轮累计学术254，经#735两条并行审核17记录去重为14篇（重合 DOI 10.1021/acs.orglett.6c02867、10.1021/acs.orglett.6c02736、10.1021/acs.joc.6c01733）后累计268篇，且正式253。保留政策禁止正式入库 Nature Communications DOI 10.1038/s41467-026-77616-8，不能偷换审核批准与正式发布口径。

本次继续新增10篇 DOI 无重、ACS 出版社 Published Online 与冻结Crossref+OpenAlex一致、实际可分离制备贡献和两遍文章特定科学审核的Original Research。JOC7篇：
- 10.1021/acs.joc.6c01762：光化学烯基重氮酯/TMSN3转β-氧代重氮醛/酮，区分瞬态环丙烯和最终产品。
- 10.1021/acs.joc.6c01386：Zn SET/XAT 芳基重氮盐+烷基碘化物自由基偶氮偶联，非金属自由。
- 10.1021/acs.joc.6c01518：硒粉、芳基硼酸、N-酰基苯胺三组分区域选择性C–H硒基化。
- 10.1021/acs.joc.6c01319：C60富勒烯 cis-1/cis-2 双氮杂环丙烷化需要100mol% Cu(OTf)2，不能称低负载催化，收率约30-35%。
- 10.1021/acs.joc.6c01511：超声或者机械化学NIS条件构建两类1,2,4-噻二唑，而不是必须超声加机械化学接力。
- 10.1021/acs.joc.6c01782：NIS诱导2-异戊烯基2H-吡喃级联亲电环化制备与iso-THC相关的碘代桥环三环，不宣称THC全合成。
- 10.1021/acs.joc.6c01576：手性预配置多元醇叠氮与醌构建醌-三唑糖杂合物，不夸大对映选择性催化。
Org Lett3篇：
- 10.1021/acs.orglett.6c03393：镍/光氧化还原三组分炔烃+亚磺酸盐+溴代炔磺酰炔基化得到E式烯炔；E/Z>20:1 ≠ ee。
- 10.1021/acs.orglett.6c02782：光诱导吲哚稠合8元二氮杂环构建，C3转化为后续单独反应。
- 10.1021/acs.orglett.6c03358：无过渡金属邻碳硼烷笼B(3,6)双烷基/双芳基化，NBO机理计算不等于中间体直接观测。

学术证据文件：
- audit/historical-reviewed/2026-10-17-ten-new-originals-seven-joc-two-pass.json
- audit/historical-reviewed/2026-10-17-ten-new-originals-three-orglett-two-pass.json
- audit/historical-reviewed/2026-10-17-orglett-6c02882-acs-page-date-variance-hold.json
- scripts/test-historical-q3-ten-more-acs-originals-20261017.mjs

另有来源日期冲突 DOI 10.1021/acs.orglett.6c02882，ACS issue 页面首发8月24日 vs DOI 页面8月25日，冻结Crossref/OpenAlex8月24日。真实Ir借氢有机合成不排除，但独立保留日期疑点，不自动批准。旧的两篇长期日期冲突 pending 不改变。

## CI 与合并证明

第一轮CI检测到PR#735固定累计268的旧回归误拒扩展278；修正为仍然精确验收#735的14个DOI（accepted.slice(254,268)）和动态全清单个数，未降低任何证据、出版日期或政策负面断言。后续更新新10篇测试为历史归档意识：如果将来经合法08:00上线，要求正式卡`ingestionChannel=historical_backfill`, `mediaPolicy=toc_only`, `addedDate=""`, `new!==true`且出版日与学术审核相同；不得误把合法历史发布当日新增或重复入库。所有代码仅审计与测试，不直接写正式目录。

最终 PR#737 精确头 SHA c9c606ce441177af01a6adfe135606329f6c718d 六项必需CI全部success：
- Historical reviewed archive admission authorization regression
- Historical Q3 reviewed-scope provenance
- Historical 2026-Q3 completeness/source/review isolation regression
- Target journal Tampermonkey capability regression
- Private PDF capture v2 regression
- Site quality gate，包括Playwright、前端构建、Worker、API，全部成功。
合并调用第一次连接 RemoteProtocolError 且 GitHub回读确认为仍open，重试后成功合并 SHA 22c50581a660dde2024e753970ad1e7c00179e9a；main和PR回读确认。

## 合并后主线/正式入库准确指标

main累计审核已批准 **278篇**，原有待核 **2篇**，checked 280；正式历史入库 **253篇**，全站正式文献 **1337篇**。278学术批准和253正式收录账面差25篇，其中24篇为可送往下一次08:00流程评估的尚未正式收录DOI（14篇来自PR#735、10篇来自PR#737），1篇为长期明确的owner-policy禁止正式入库DOI 10.1038/s41467-026-77616-8。均不可以直接假设全部通过发布门禁。PR737这10篇正式入库仍为 **0**。

最新历史staging（2026-10-16 18:46 UTC） Q3 尚待学术或日期核验11121、全历史来源 distinct DOI58088、完成窗口407/3600、40个deferred OpenAlex来源窗口，原因全部 `openalex:http_401:api_key_missing`。GitHub Actions工作流已经引用 `secrets.OPENALEX_API_KEY`，但需要由授权人通过安全设置确认 Secret 是否存在并且可读取，不能把401算作已成功，也不能在聊天里索取或泄漏私钥。

正式历史目录隔离/主线合并后验证：formal历史253，全部能在学术批准查到，无历史重复DOI；PR737新10篇没有正式发布；Q3仅`toc_only`, `new=false`, `addedDate=""`；没有 Cloudflare D1、TOC、PDF、正文、SI、网站Today/Hot、公众号每日新增的直接写入。唯一北京时间每日08:00正式发布授权保留。下一次正当窗口2026-10-18 08:00北京时间，仍需要该流程实际运行与回读检验。

最终答复：本轮恢复及审核任务完成，主线278学术批准、正式历史253，下一批24待正式门禁评估，OpenAlex40个401窗口仍未修复。本日志与用户最终回答一致且不含任何密钥。
