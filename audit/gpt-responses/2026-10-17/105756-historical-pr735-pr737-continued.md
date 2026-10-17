# 历史回溯续作｜2026-10-17｜完整响应及结论

- 北京时间：2026-10-17T10:57:56+08:00
- 对话：继续历史回溯、连接中断后恢复，涵盖 PR #727/#735/#737
- Git 主线前序合并 SHA：62925cd4196d910a6cd7cf5699870a6fd894af61
- 关键入口：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/735 、https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/737
- 本文件仅保留学术和执行审计，不含私有凭据。

## 用户可见答复的工作详情

已从上次中断点读取 GitHub main、`staging/historical-archive-nightly` 和10月17日08:00后的正式目录，确认此前 PR #727 已合并、10月17日正式历史入库从122增加至253、全站正式文章共1337。审核初始累计254、原有两项精确日期 pending。Q3 staging 未审或日期核验11121（staging快照），全历史不同 DOI58088。全历史来源窗共规划3600、已完成407，另有40个 deferred roots 均为 `openalex:http_401:api_key_missing`，不能将其标记为来源完整。

PR #735 从两条并行学术审核 PR #730（9篇）及 #732（8篇）整合17条记录，识别3条 DOI 重复：10.1021/acs.orglett.6c02867、10.1021/acs.orglett.6c02736、10.1021/acs.joc.6c01733。新增只计14篇，累计批准 254→268，原有2项日期争议、冻结根与论文各独立科学反证均保留。6个必需CI工作流（包括网站质量门禁）在精确PR head成功后，合并 #735 至 main，合并SHA `62925cd4196d910a6cd7cf5699870a6fd894af61`；原PR #730、#732附合并说明关闭，不重复合并。

正式主线重新回读：268篇学术批准、2篇日期pending，正式网站文献记录1337、正式历史253篇，无重复历史DOI；253全部属于已有学术批准、所有历史记录均`addedDate=""`、`new!==true`，旧期媒体策略是`toc_only`或`metadata_only`。其余15篇学术批准尚未正式上线，其中1篇为既有用户政策排除DOI `10.1038/s41467-026-77616-8`，14篇为PR #735新审核，仍须通过唯一北京时间08:00的下一次正式发布。

继续从完整冻结ACS来源队列筛出10篇新的原创研究，出版社Article History Published Online与source roots均一致、DOI不在正式目录或268批准中。JOC 7篇：
1. 10.1021/acs.joc.6c01762（2026-08-28）烯基重氮酯与TMSN3光化学重氮转移，经瞬态环丙烯、偶极环加成及水解给β-氧代重氮醛/酮。
2. 10.1021/acs.joc.6c01386（08-31）Zn-SET/XAT芳基重氮盐与烷基碘化物偶氮偶联，非无金属。
3. 10.1021/acs.joc.6c01518（08-31）溴离子催化N-酰基苯胺/硒粉/芳基硼酸C–H硒基化。
4. 10.1021/acs.joc.6c01319（08-27）100mol% Cu(OTf)2调控富勒烯cis-1、cis-2双氮杂环丙烷化，收率约30–35%，不能误称低负载催化。
5. 10.1021/acs.joc.6c01511（08-28）超声与机械化学替代途径经脱氢C–N/S–N关环合成两类1,2,4-噻二唑。
6. 10.1021/acs.joc.6c01782（08-26）NIS促进2-异戊烯基2H吡喃亲电级联得到碘代桥环三环，不是THC全合成。
7. 10.1021/acs.joc.6c01576（08-31）已有手性糖醇–叠氮衍生物与醌级联生成醌–三唑多元醇糖杂合物，不夸称不对称催化。
Organic Letters 3篇：
8. 10.1021/acs.orglett.6c03393（08-31）光氧化还原/Ni催化炔烃+亚磺酸钠+溴代炔1,2-磺酰炔基化，高E选择性>20:1并非ee。
9. 10.1021/acs.orglett.6c02782（08-31）光化学二氟甲基化/关环制备吲哚稠合中等尺寸二氮杂辛环，后续另行C3官能团化。
10. 10.1021/acs.orglett.6c03358（08-26）无过渡金属的邻碳硼烷笼B(3,6)位双烷基/双芳基官能团化，NBO计算为解释非中间体直接捕获。

这10篇分别以主观首遍具体制备和独立撰写第二遍科学反证建档，且均带raw staging Git blob、review queue blob SHA与root SHA256、真实作者及期卷页。其审核文件：
`audit/historical-reviewed/2026-10-17-ten-new-originals-seven-joc-two-pass.json`
`audit/historical-reviewed/2026-10-17-ten-new-originals-three-orglett-two-pass.json`。
另独立保留Org Lett `10.1021/acs.orglett.6c02882` ACS issue路线2026-08-24与DOI路线2026-08-25首发日冲突：
`audit/historical-reviewed/2026-10-17-orglett-6c02882-acs-page-date-variance-hold.json`。该文真实合成方向未被误排，但未入批准manifest。

上述新批次归入 PR #737，新增10篇使分支累计学术批准268→278，原2件日期争议未变、6c02882另外独立暂缓。PR分支已记录测试 `scripts/test-historical-q3-ten-more-acs-originals-20261017.mjs` 并纳入历史 admission workflow；人工静态重复DOI/书目/首发日期/分区/审核challenge及SHA检查均无异常。PR #737本轮最终读回仍open，6组GitHub Actions全部处于`queued`，**尚未完成CI，不能宣称合并或成功通过**。其余正式历史仍253篇。这不是新的正式发布，不写`public/toc-demand-live.json`、Cloudflare D1、任何PDF/全文/SI、Today/Hot/公众号日更或08之外发布。

结论：main目前已确认268篇累计学术批准，正式历史253篇；PR #737分支有278篇学术批准，但CI排队，尚未并入main。需等六项精确head CI success 后重新确认并合并；正式历史新增只能在北京时间每日08:00既定流程进行。本回复同步保存该信息供后续恢复连接使用。
