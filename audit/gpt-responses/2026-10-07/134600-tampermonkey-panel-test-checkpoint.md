# Tampermonkey panel test compatibility checkpoint

- 北京时间：2026-10-07 13:46
- 对话：Tampermonkey 面板截图核实后的第一批已授权修复；用户于 13:31:57 同意。
- 主功能提交：2f6c1261992e63332f76612f179ad3c5818e94d6；Bridge 2.2.60 / install 6.2.41。
- 范围：最近进展时间、无任务 PDF 文案、只读控制归属/中断提示；未改变采集、暂停、租约或自动恢复行为。

## 回归证据

专用浏览器回归 run 37577437599 成功，包含桌面/窄窗口、31 项状态断言、12 项窗口/归属断言、立即重启保护与安装包构建。

主线 queue coverage run 37577562384/job112649768772、target journal run37577562369/job112649768191、publisher media run37577562438/job112649768899、private PDF run37577562361/job112649768534 均失败于同一共享 fixture：tests/tm-queue-coverage.test.mjs 直接向 captureLiveText 传 phase 而没有状态快照 state，导致“未补齐”断言收到“已停止：”。后三者后续浏览器步骤因此 skipped，不能声称它们已完成全流程。

本提交只将该样例改为写入模拟 summary 后调用 captureLiveSnapshot，再渲染；保留原数量/状态断言，并补充 snapshot.state 必须为 blocked_remaining 的断言。真实采集器和版本保持 2f6c 内容。修复后本地18项 queue coverage 全部通过，真实出版社请求0、生产写入0。

主线并发审计提交9875e0fee6a71c3d5d6049ae469ea9b79bc90f67已作为本提交基线保留。没有重跑部署或用户采集任务。

## 用户进度说明

已确认四条失败检查都卡在同一个旧测试样例。我已让它按实际面板流程读取状态，18 项队列检查全部通过，采集代码无需再改。部署已完成前端上传，我接着核对公开安装包版本。
