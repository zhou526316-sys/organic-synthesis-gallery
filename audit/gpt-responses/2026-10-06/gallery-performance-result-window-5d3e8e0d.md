Beijing time: 2026-10-06 23:xx +08:00
Context: Gallery performance optimization
Related commit: 5d3e8e0d34b136b36debc2b6a8fc5af296615e93

User-visible reply:

这一小批已经完成并提交。

本轮主要解决“首页一次渲染太多卡片”的剩余性能瓶颈：
- 桌面端：单页从 60 张卡片降到 24 张；
- 手机端：单页固定 2 张卡片；
- D1 历史检索也按相同窗口请求，不再一次取 60 条再只显示一部分；
- 浏览器跨过手机/桌面断点时会自动重置页码，避免分页错位。

上一轮正式域名实测已经从约 8.35 秒降到约 6.98 秒；这次缩小 DOM 窗口主要继续降低首屏 DOM 构建、TOC 占位、MutationObserver 和媒体扫描开销。

自动发布已经触发，目前 Worker、GitHub Pages 和 Cloudflare Pages 三条发布任务都已开始运行。我这轮不再继续轮询，避免再次把聊天拖到超时。