# 历史回溯继续执行与 Cloudflare D1 日额度保护

- 北京时间：2026-10-13 10:59:45
- 所属项目：抓取有机合成文献并持续更新网页 / Organic Synthesis Gallery
- 用户要求：连接中断后继续历史回溯；注意当日 D1（用户写DI）额度
- 仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一正式发布基线
- 状态：以下数字依据本轮 GitHub staging 和 Actions 真实回读；未声称全部16刊历史回溯完成；D1当天真实消耗/剩余未知

## 正式D1免费额度规则

Cloudflare Workers Free D1文档：每日rows read 5,000,000、rows written 100,000，重置时间00:00 UTC（北京时间08:00）；2026-09-01起超额后查询失败而不是只做软提示。来源：https://developers.cloudflare.com/d1/platform/pricing/ 与 https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/ 。本轮未读取用户账户Cloudflare Billing/GraphQL用量，所以不能确定是否在免费计划，也不能推定当天实际剩余额度。

## 完成并已上线 GitHub main 的改动

1. [PR #579](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/579)，squash commit b2365286cad7e871822d45ecab00089036a2ec82：跨16刊、跨日期的320条DOI唯一科学审核清单，20/刊与P3关键词低覆盖抽样；摘要/正文、学术include/exclude不自动生成，来源保留在独立GitHub staging，候选/工作清单生成不查询生产D1。
2. [PR #581](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/581)，commit 902bba70175402c0d2a28f267a74d4f3d6341414：Nature Synthesis 2026年第5卷第8期Research栏目出版社目录核对，13篇均在2026年3、4月历史来源批次找到，另3条非Research栏目单独记录。真实独立来源回读 [#38338716268](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338716268) success，13/13匹配、来源遗漏0、出版卷期月份与first-online月份不一致13例。仅一卷期research section验证，绝非所有出版社卷期/无DOI完整。
3. [PR #580](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/580)，commit 2d80a8d1388f4e080865d4ac68d40b581c2900d6：隔离历史D1读取：Pull request及普通push只做离线合同测试；只有成功的main catalog-index同步或明确手动force_d1_readback才可能验证；使用GitHub Actions缓存按北京时间08:00 slot在访问D1前预留唯一自动机会，重复同步跳过；单次最多16次历史目录API请求、每文章日期最多3页，超预算fail-closed。GitHub缓存/请求数不是D1行扫描计费指标，不代表账户真实余额。合并后push测试 [#38338943212](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338943212) 证实production-readback为skipped，不查询D1。
4. docs/historical-d1-daily-budget-contract.md 已纳入项目，保留08:00唯一正式入库与历史媒体、公众号隔离。

## 完成的真实历史来源与队列运行

- [#38338596140](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38338596140) staging 320审核工作清单成功：原有346 source-complete roots，49,791去重候选，320条唯一DOI、16刊各20、32条P3样本；只是review worklist，非科学include。
- [#38339077415](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38339077415) 新一轮源补采：220 Crossref/OpenAlex请求，processed 27，blocked=false、deferredBudget=true，完整期刊×日期窗口346→371，游标2025-07 Nature Synthesis，未进行生产D1读写/旧媒体/PDF采集。
- 自动对齐的 [#38339307195](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38339307195) staging unique DOI回读：371 / 3,600规划来源窗口，**55,708**唯一DOI（不是55,708篇应收录的有机合成研究），仍需双遍审核54,912，已审定待合法08:00发布12，source/date冲突待定2；当前正式979篇目录含历史8篇，之前8/8正式D1/Pages验收已在独立read-only工作流通过。
- 2026-07-01以前metadata_only，2026年7—9月toc_only，历史补录不进入Today/Hot/公众号每日新增，禁止在正式08:00槽外入库。
- 将原已启用的北京时间每日23:40“Gallery 历史回溯验收”定时任务更新为优先消耗reviewer-worklist并严格禁止调用生产D1；保持原调度及科学双遍审核规则。

## 仍需关注

- [PR #584](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/584) 处理真实320样本中的非合成“asymmetric”假高优先级，保留明确不对称催化/合成例子；论文不会因为排序变化而自动排除。截至该报告写入时其站点质量CI还未确认完全结束，不得把它误报为合并。
- 16刊自创刊回溯尚未完成，逐期出版社Research目录核对刚建立第一个实证样本，无DOI古早文献尚无全面书目清点。
- D1真实当天row read/write只能依Cloudflare账户Billing > Billable Usage或D1 Metrics查询，**没有已验证余量**；历史抓取应保持GitHub staging，不触发反复全站D1扫描。
- 生产正式新增仍只在北京时间每日08:00执行；没有新增夜间正式入库、恢复18:00、修改媒体/PDF权限或进行任何免费计划升级。
