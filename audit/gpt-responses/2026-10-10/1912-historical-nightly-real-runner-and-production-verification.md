# 2026-10-10 北京时间 19:12｜历史文献标题/TOC 分流及 23:00 真正云端候选采集工作实录

会话：用户连续要求“继续”，延续 7—9 月标题核验、TOC-only 历史补录、正式新增隔离以及 16 刊每晚 23:00 历史回溯。

## 正式修复与生产验收
- PR #468 于 2026-10-10T09:56:46Z 合并 main，merge SHA b27c80d2bd741499ab6662a954bacc0d0348f54f。最终候选 head a76c38fdbd8f2749cee2b441a681f3d2e7eb565b，28 项 CI 全部成功。定义 historical_backfill/TOC-only/metadata_only，历史补录排除今日新增及 Hot/今日统计，不新增 7—9 月 PDF/正文图/全文；已存在合法媒体和权限保留。
- 7—9 月静态数据中 83 条英文标题缺口都有 DOI 关联的 Crossref 或 ACS/Nature/Crossmark 元数据依据；已用于缺失标题的限定显示修复，不覆盖已有正确的论文正式数据，不等于整库标题或中文翻译已全部补齐。另一个工作线完成了 125 条广泛标题展示层修复。
- 正式网站只读浏览器实际按 DOI 验证 10.1021/acs.orglett.6c02216、10.1021/acs.orglett.6c02293、10.1038/s41467-026-77437-9。三篇标题正常，不显示“正在核验标题”；后两篇 TOC 已显示，第一篇主图仍为 Original graphic pending，出现在 toc-demand-live.json 可见缺图清单中。只是三篇样本，不代表全部 TOC 补齐。
- PR #488 于 2026-10-10T10:51:48Z 合并 main，merge SHA 8c3d55f65fb7ebfc9b11ff1ae2a68bb55fa293f3，修正线上验收脚本仍期待已退役 recentFullCaptureEligible 派发代码的误报。PR CI 全通过，主线合并后只读验收 #38046388481 success。正式 gallery/api 两域名安装包均为 Bridge 2.2.81、安装引擎 6.2.62、HTTP200、含 TOC-only 和私有 PDF 保护；匿名 PDF 库存接口未授权访问被拒绝。
- 正式 release-delivery.json 线上 sourceCommit 0534812074ab06a1e6780d320f0ac560ab7e0677，GitHub compare 证明它包括 PR #468 代码；productionCards 938，仅验证发布目录数量，不代表历史全量已收录或所有 PDF 可读。

## 23:00 真正历史候选采集器（不是网站正式发布）
- PR #492 于 2026-10-10T11:09:19Z 合并 main，merge SHA e672904760ab21b8a433bdb2d9c0dbc9bd2ad7e1，新增 scripts/historical-nightly-discovery.mjs、6 项专项集成回归及 .github/workflows/historical-nightly-discovery.yml、historical-nightly-regression.yml。专项、正式站质量、TM/PDF 兼容检查均 success。
- GitHub Actions cron 0 15 * * *（UTC 15:00，北京时间每晚 23:00）自动运行，电脑关机仍可由云端执行。GitHub schedule可能有延时，不能保证分钟级准确启动。
- 只写 staging/historical-archive-nightly 分支 audit/historical-staging，不写 main、正式文献源、媒体/PDF 库或正常 08:00 发布。首次倒推日期范围 2026-09-22..30，优先 JACS/Angew，全 16 刊，单晚初始预算最多 8 个期刊×历史日期窗口；分期断点、DOI去重、Crossref+OpenAlex来源完整性检查，失败/限流不冒充完整；每个候选未完成双遍学术审核前标 unfinished。
- Crossref JACS 0002-7863 于 2026-09-22..30 查询实际返回总数 155；OpenAlex 同范围/ISSN 实际返回总数 153。两来源候选定义存在差异，不应误把相差 2 篇解释为遗漏或完整。最初 OpenAlex select 的 has_abstract 字段 HTTP400，经对照修复为受支持的 abstract_inverted_index，真实读回HTTP200。仅保留摘要可用性及待验证版权状态，不保存原文摘要。
- 独立暂存分支 staging/historical-archive-nightly 已初始化 audit/historical-staging/state.json；在 2026-10-10 北京时间 19:10 查验时 completed=0,lastRun=null，第一轮真实23:00采集尚未发生，不能说历史文献已补录上线。
- 既有 ChatGPT 自动化任务 id 6ac9de345ca081918a8bc5871e111e3c 已更新为北京时间每天23:40的 Gallery 历史回溯验收与中文报告，而不再23:00重复发起API爬取。先看GitHub真实运行/staging状态，再抽样学术审核、报告阻塞，不生成第二条重复夜间抓取。

## 未完成和安全边界
- GitHub Actions 的首次真实 nightly crawler 运行尚未产生记录；正式历史批量学术双遍审核、8:00历史独立准入、原文摘要版权许可后的索引与引用格式 UI 等仍是后续工作，不把此夜间候选采集器称为全功能历史数据库。
- 10.1021/acs.orglett.6c02216 的真实 TOC 尚待 Tampermonkey 媒体工作线补齐；夜间采集器不抓 PDF 或正文图。
- 不修改每日北京时间08:00唯一正式文献发布、不恢复18:00、不从夜间 staging 自动向网站发布未经审核的DOI。

链接：
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/468
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/488
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/492
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/.github/workflows/historical-nightly-discovery.yml
- https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/staging/historical-archive-nightly/audit/historical-staging/state.json

## 用户可见最终答复摘要
三条PR均已合并，真实线上三DOI标题查验通过；两篇有TOC、另一篇仍待TOC；23:00云端历史候选抓取工作流已上线，23:40审核汇报；真实历史抓取尚未开始，未经双遍范围审查不正式入库。
