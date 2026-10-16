# 2026-10-16 08:57:43 Asia/Shanghai — Tampermonkey 14–16 Oct throughput root causes

Conversation: user asks “前天的文献的各种抓取能力很强，基本所有文献都能一次性补齐，为什么昨天和今天不行？” This is a read-only, evidence-based feedback diagnosis, not a repair approval, media write, or deployment.

## User-visible partial answer
已经找到明显的性能退步。主要原因不是出版社突然变得更难抓，而是 10 月 15 日新版抓取控制器过早终止任务，加上库存读取超时、出版社适配失败和 PDF 上传耗时，导致大量文献根本没有完成采集。

| 指标 | 10 月 14 日 | 10 月 15 日晚间 |
|---|---:|---:|
| 抓取引擎 | 6.2.65 | 6.2.67 |
| 待处理 DOI | 207 | 198 |
| 实际访问 DOI | 101 | 9 |
| 尝试次数 | 111 | 10 |
| 确认完整补齐 | 43 | 1 |
| 本轮成功保存 TOC | 43 | 0 |
| 库存读取错误 | 0 | 至少 6 项 |

10 月 14 日并非 207 篇全部补齐，但一次任务能持续访问 101 篇，确认完成 43 篇。10 月 15 日晚间只访问了 9 篇就终止，最终留下 190 篇未访问任务。最严重的退步发生在任务调度和连续运行能力，而不只是单篇文献的图片识别能力。

## User-visible follow-up conclusion
已核实影响程度最大的五项问题：

1. **全局熔断误判**：PR #684 在 6.2.67 中加入 `publisher_script_missing_3_consecutive`，按失败“尝试次数”而非独立 DOI 计数。10 月 15 日，Chemical Science `10.1039/d6sc06879k` 连续两次心跳缺失，加上 Chem `10.1016/j.chempr.2026.103008` 一次，触发整个缺项队列停止。原因只证明控制器没有及时收到对应 heartbeat，并不能证明整批出版社脚本都不可用。当前 6.2.69 中这条全局熔断逻辑仍存在。

2. **DOI 分片只缩小返回数据，没有真正缩小服务端读取代价**：控制器按 80 DOI 一批、16 秒超时读取库存，Worker 的 `getStagedArticleFigures(...inventory=1)` 对每批仍先从 R2 读取整个 `stage-index.json` 与 report-index，再按 DOI 过滤。10 月 16 日索引已达约 6.15 MB、3,889 项；约 15 批会重复读取该大索引，10 月 15 日的两个 TOC 分片、三个正文图分片、全文库存请求出现 16 秒 deadline。6 MB→32 MiB 上限的修复避免了索引被拒绝，但不能消除重复索引读取造成的延迟。

3. **任务层级更重且完成口径不能混用**：10 月 14 日的结果是 43 个 TOC、2 张暂存正文图和 11 项正文证据，并非 43 篇已经四层完整。10 月 1 日之后，只要因真实缺项访问出版社，同一页面还要尝试正文图、全文和 owner 私有 PDF。旧日志包含 GM 请求超时、图像上传耗尽预算、PDF 上传 deadline 与明确 403；一篇耗时变长，PDF 失败也会留下独立未解决义务。不可通过简单延长所有等待预算解决。

4. **库存规模与新增文献使网页空图增多**：正式 DOI 目录 10 月 14 日 1,087 → 10 月 15 日 1,151（+64，其中 31 篇是 7–9 月 TOC-only 历史收录）→ 10 月 16 日 1,186（当日正式新增 35）。10 月 16 日 08:00 生成的媒体队列中当日 35 篇均无卡片主图，全站缺主图 105 篇，其中 RSC 31 篇。新增队列和媒体采集不在同一时刻完成，会造成新论文看上去大量漏图；并非等于旧图被删除。

5. **本机版本与正式安装版本未同步的证据**：10 月 16 日北京时间 08:30 上传的实际本机日志仍是 `installRevision=6.2.68`，而正式 Bridge 2.2.88 内嵌版本为 6.2.69。这份 08:26 开始的新日志处于 `inventory_refresh`，`total=0` 并不表示任务最终零产出。相同 R2 自动回执可见 Science `10.1126/science.aeh6251` 实际保存 TOC、6/6 张正文图和全文，Nature `10.1038/s41467-026-78287-1` 仍发生 TOC/正文/PDF 失败。可见有可用的出版社采集能力，问题不是完全失效。另 R2 暂存索引从前夜 3,874 增至 3,889，属于真实库存变化。

**建议修复顺序**：第一优先取消“同一 DOI 多次失败计入全局熔断”，改为 DOI/出版社级隔离和可恢复继续；第二让库存按 DOI 在服务端索引读取而非每批重复解码整个 R2 大对象，且完整记录耗时；第三将已下载且校验的 owner PDF 作为安全持久待补传，避免阻塞 TOC/正文图/全文；第四将官方 TOC、可用主视觉、正文图完成率、全文完成、私人 PDF、前台发布分别计数，并在真实浏览器持续多 DOI 批次中验收。真实 401/403/429 必须尊重，7–9 月历史仅官方 TOC，08:00 唯一正式发布不变。

本次是反馈核验，依据 PROJECT_RULES.md 的“吐槽先核实后批准”规定，尚未修改采集代码或生产数据。待用户批准明确修复范围再提交 PR。

## Evidence
- 10月14 owner run: audit/gpt-responses/2026-10-14/234135-tm-after-552-660-owner-read-continuation.md; real owner captured 101 distinct DOI/111 attempts/43 complete/43 TOCs/2 figures/11 evidence.
- 10月15 owner run: R2 authenticated read workflow https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38705066633 ; 6.2.67 complete pass stopped with publisher_script_missing_3_consecutive, 190 unvisited.
- 10月16 most recent read-only rerun: same workflow current job 116752448491; upload BJT08:30, 6.2.68, phase inventory_refresh, staging 3,889.
- PR #684 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684 added heartbeat breaker with per-attempt counting.
- Worker source cloudflare/worker/src/local-captures.js and controller public/toc-mainline.user.js: DOI filtering after full R2 stage/report index GET; batch 80 timeout 16s.
- public/toc-demand-live.json generated 2026-10-16T00:00:24.343Z: total 1186, latestAddedCount 35, visibleGapTotal 105, missingOfficialTotal 243.
- PR #702 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/702 is the independent PDF owner authorization handoff repair, not the scraper throughput repair.

response_sync_status=committed. No credentials or private PDF contents included.
