# Tampermonkey manual interrupted-run recovery implementation

- 北京时间：2026-10-07 14:01
- 对话：Tampermonkey 接续；用户 13:52:47 指示“继续，好了给我更新链接就行”。
- 版本：Bridge 2.2.61 / install 6.2.42；capture protocol 6.2.20 / controller 2.2.41 / RSC v14 保持。
- 只推进已核实的刷新中断续跑小批次；分层错误显示与RSC新回执排查留待后续。

## 确认的问题和改动

刷新会丢失内存 manualExecution，而 GM 中 manual 标记继续禁止旧自动调度，形成永不续跑。定时器原先仅在没有 active 时检查，孤立 active 也会永久挡住下一次恢复资格检查。

新增 guarded tryResumeInterruptedManualRun 与 controllerTick，保留旧全库调度屏障、显式立即开始强制语义。只有同run正在执行的missing_only summary、同协议与controller、未暂停/ABORT/结束/stopReason、无本地执行、无显式resume请求且无有效lease才是候选。先以dryRun读取既有active reconciliation；有新鲜任务或10分钟保护窗口时连过期lease也不改动。通过250ms acquireLease后再次确认manual与lease，再清理已完成或明确孤立active；随后建立新generation，从当前库存和可信本地回执重新计算缺项，保存resumedFromRunId。

自动路径不清ABORT、不设ENABLED=true、不清出版社冷却、不删除凭据/检查点，不承认旧generation的晚到回执。不复用已丢失的内存coverage Map；新一轮统计明确记录来源。完成或异常终止的summary即使manual缺completedAt也会阻止自动循环重试。

## 验证与限制

本地16项恢复检查、19项立即开始回归、25项控制器回归、18项队列覆盖均通过；真实网络/生产写入0。本地缺Chromium，实际浏览器验收交给修复分支唯一短CI，不能提前宣称浏览器通过。missing-only本地因未下载worker依赖不能运行，CI使用完整仓库验证。两控制页browser fixture使用共享localStorage模拟GM、真实250ms等待，仅模拟采集循环；库存与实际执行循环由Node测试覆盖。

源码 SHA256: 600eae1aaaf61d7049e7d6c739970b6bdaa0ffd63665f377352488e4214bc17d

## 用户进度说明

续跑、暂停和旧回执隔离检查已通过。我正在做两控制页竞争的浏览器验收；通过后发布，并直接核对更新链接里的脚本版本。
