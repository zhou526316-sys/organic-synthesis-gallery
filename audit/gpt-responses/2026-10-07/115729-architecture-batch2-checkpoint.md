# Architecture batch 2 — recoverable checkpoint

Beijing time: 2026-10-07 11:57:29 (+08:00).
Context: architecture continuation; legacy Pages deployment ownership; user steered the same batch to online-date pages at 11:52:58.
Related code: this commit; parent `134ca44790d9e77dadd5e0a781843f1530ad1728`.
Status: legacy Pages local implementation complete; online-date UI is in progress and is not claimed live.

## Complete assistant progress replies

### Reply 1

我继续核对旧 Pages 镜像的授权和调用关系，先确认它现在还承担哪些功能，再决定如何收尾。这轮仍按可恢复的批次推进。

### Reply 2

已开始下一批。旧镜像的错误涉及 Cloudflare 授权，我会用插件管理技能检查是否有可用的管理入口，同时核对当前调用方；摘要候选查询的切换条件也在同步检查，避免这一处阻塞拖住其余架构工作。

### Reply 3

调用关系已查清：正式网页和当前采集主线都使用自定义 API。旧镜像则有两个自动部署器，一个发布纯静态站，一个发布 API 版本，会覆盖同一个 Pages 项目。

我会先把这两个旧入口改成只读检查，移出自动发布，保留旧地址供兼容检查。另一个发现也会写进交接：所谓“摘要候选切换”属于已停用的旧审核链路，当前每日摘要不走它，不应为了收尾重新启用。

### Reply 4

明白，我把分页改为按论文的 **online 日期**组织：一页对应一天，同一天的论文放在一起，用“前一天／后一天”切换。

我会先核对现有日期字段和列表查询；论文较多的一天也保持在同一个日期页内。这项调整会接到当前批次里继续做。

### Reply 5

已确认，当前网页确实按“桌面 24 篇、手机 2 篇”翻页。我会把外层导航改成 online 日期，同一天内连续向下阅读；底层仍分批读取，避免论文多的一天拖慢手机。

旧 Pages 的只读改造已通过 28 项本地检查，接下来会先提交这个独立进度点，再继续日期页的实现和验收。
