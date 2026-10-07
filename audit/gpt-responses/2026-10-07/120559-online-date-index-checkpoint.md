# Architecture batch 2 — online-date query checkpoint

Beijing time: 2026-10-07 12:05:59 (+08:00).
Context: same architecture batch, including the user's one-online-date-per-page direction.
Related code: this commit; parent `d0e82a209138aa5559eb7e538d1bc59a64574ac1`.
Status: exact-day index optimization and deployment canary prepared; frontend date-page implementation remains in progress.

## Complete assistant progress replies since the previous checkpoint

### Reply 6

旧 Pages 的两个自动发布入口已停用并提交，保留了手动只读检查，部署边界的 CI 正在验收。

日期页这边还查到一个相关性能问题：现有“查某一天”的 SQL 没有充分用上日期索引。我会一并修正，确保切换日期时直接定位当天记录；同日内容通过滚动续读，手机端也按整天浏览。

### Reply 7

日期口径已核实：日期页使用论文的首次 online 日期；“今日收录”继续使用加入网站的日期。精确论文链接、专题链接和全站搜索会保留各自的行为，避免被默认日期页过滤掉。

浏览器验收也会接到正式发布前，重点检查跨天切换、同日续读和手机滚动。

### Reply 8

单日查询已通过 19 项回归，执行计划确认会直接命中“日期＋论文标识”索引。上一批统计接口的 39 项回归也全部通过。

日期页的主要代码已经完成，正在补齐滚动和切日测试。我先部署兼容现有接口的查询优化，让后端验收与前端测试并行推进。
