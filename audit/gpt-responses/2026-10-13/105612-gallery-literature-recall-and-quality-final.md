# Organic Synthesis Gallery｜2026-10-13 文献发现与科学审核修复验收

核验截至：北京时间 2026-10-13 10:56:12。仓库：zhou526316-sys/organic-synthesis-gallery；main 为生产唯一基线。

## 一、修复已合并

| PR | 已完成的修复 | 验收 |
|---|---|---|
| [#560](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/560) | 增加出版社 DOI feed 候选来源与来源失败记录，历史排除遇新增证据可挑战 | 已合并 |
| [#570](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/570) | 把旧 Wiley 首次发表日期不明 DOI 和历史排除变更分入独立、持续保留的队列 | 已合并 |
| [#572](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/572) | 修复 ACS Silverchair RSS GUID 页面路径误并入 DOI，JACS/OL/JOC 官方 RSS 真实 DOI 可识别 | 已合并 |
| [#574](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/574) | 增加 Crossref 重新提交元数据的七天安全补扫，旧 DOI 不作为当天首次发表 | 已合并 |
| [#576](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/576) | 修复 skeletal editing、enantioselective、catalytic、dialkylation 等方法学词形被错误降级 | 已合并 |
| [#583](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/583) | 正式转换器保留同 DOI 配对机器 handoff 的原始摘要，防止同一证据跨日误判为新证据 | 已合并，全部8项 CI 通过；合并提交 055990ebe62ec555ed28fb2dcb98a84a6365d025 |

10月1日至10日正式审核记录已复盘：10天各自16刊的出版社独立完整目录检查 `checked=0`，说明旧审计不能证明每日全部有机合成论文已找齐。10天正式review去重共有1281 DOI，其中24个不同的高优先级排除记录当时摘要字段为空。它们不是24篇已证实漏收，必须按原文制备证据逐篇挑战。历史诊断保存在 `audit/diagnostics/literature-recall-2026-10-01-to-10-10.json`。

## 二、真实生产验收

10月13日北京时间08:00的正式新增仍为7篇，另有历史补录8篇，生产总库979篇，所有旧卡片均保留。修复期间从未进行槽后增补、删除或强制覆盖。

经六条历史排除的 DOI 级再次复核并保存原始摘要，配对 `audit/latest.json`、`audit/unresolved-latest.json` 在 `2026-10-13T02:47:19.397Z` 的真实快照一致；主窗口剩余7个精确未闭合 DOI，即5个原有证据待定、2个下一槽已完成两遍取证的候选。另有约550条旧排除证据挑战、442条历史元数据重新提交 DOI，以及163条先前出版社 feed 的日期待核记录在独立来源审计保留，不是当天新增数，不能默默删除或误认为零风险。

真实 GitHub [质量验收 #38338744104](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338744104) success；协调状态修正后 [再次验收 #38338864558](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338864558) success。真实校验：`publicationChecksPassed=true`，`reviewComplete=false`，`repositoryDois=979`，`deployedDois=979`，完整剩余7 DOI，`failures=[]`。协调状态已经记录 `phase=synced_with_pending`、5 pending、2下一槽carryover及最新质量运行，修正了先前错误的 `reviewComplete=true`。

## 三、2026年10月14日08:00的科学审核衔接

- `10.1021/acs.orglett.6c04027`：铑催化邻醌二亚胺、醇与重氮化合物三组分反应；首次在线2026-10-12，10月13日08:00后才进入本次补审，已保存两遍证据和中文标题。
- `10.1021/acs.orglett.6c03617`：铱/SunPhos催化哒嗪盐不对称氢化；2026-10-13首次在线，原始摘要有底物范围、收率/ee、克级与连续流证据，已保存双遍挑战及原始日期。
- `10.1038/s44160-026-01189-z`：Nature Synthesis 硫脲一步氧杂环丁烷→硫杂环丁烷骨架编辑。原先 Nature IDP 导致证据不足的 pending 原样保存；现已关联官方完整摘要和图题的新证据，明日按现行 scope contract 重新两遍审核。

精确后槽证据：`audit/carryovers/2026-10-13-reviewed-postrelease-next-slot.json`；另外有 `audit/review-2026-10-13-postrelease-evidence-0800.json`、`audit/review-2026-10-13-postrelease-late-orglett-03617.json`。它们不授权在今天08:00后直接新增文献；次日仍需要新鲜配对审核、严格形式转换、固定08:00原子writer、Pages授权部署及线上 DOI 并集验收。

五个尚待完整制备性证据的 DOI 为：`10.31635/ccschem.026.202608292`、`10.31635/ccschem.026.202607973`、`10.31635/ccschem.026.202608252`、`10.1038/s44160-026-01189-z`、`10.1021/acs.orglett.6c03893`。

## 四、仍未全闭合的范围

当前完整出版社目录已验证数仍为0/16；虽然多刊官方RSS可返回部分 DOI，Chemical Science、Green Chemistry 等 RSC 原站接口仍可能 403、404 或 bot_blocked，CCS 正文和 Nature 部分页面也可能受阻。审计保留 `sourceCoverageAnomalies=4`、`closureCoverageAnomalies=6`、`verifiedThrough=2026-09-18`。机器数据家族健康不等于出版社目录绝对齐全；不能声称已零漏抓，不能虚写受阻0。

PR #583 合并后，预发布 Gate [#38339080874](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38339080874) 因已超过当天08:00槽且旧审核快照不再可发布而失败关闭；固定 writer [#38339111252](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38339111252) 为 skipped。没有新的18:00任务，也未取消/重启或重复发布既有08:00写入。该技术失败属于安全拒绝，不影响已通过的979篇线上验收。

[持续缺口审计 Issue #559](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/559) 已更新以上证据；仍需逐刊核对真实出版社全目录与跨日发现差异，逐项取证处理历史挑战和剩余待定，不以单日数量或工作流成功作全库查全结论。
