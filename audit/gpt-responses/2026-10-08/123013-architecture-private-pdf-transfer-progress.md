# PDF 性能续作：修复代码已合并，正式页面仍待部署

北京时间：2026-10-08T12:30:13.346+08:00
对话标识：架构续作——用户反馈 1.3 MB 私有 PDF 在 0.2 MB 处速度过慢，连接中断请继续。

用户可见核心回复及执行结果：

确认截图显示仅 1.3 MB 的论文在“正在快速获取 PDF：0.2 / 1.3 MB”阶段读取缓慢。此前用于 >3 MiB 文件的 Range 优化不能解决该小文件单流传输瓶颈。

已从 main 读取 PROJECT_RULES、PDF 阅读器和 Worker 权限路径。新修复位于 GitHub PR #404：
https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/404

实现：为 512 KiB 至 3 MiB 的已授权 PDF 并行获取至多四段 384 KiB Range 响应并严格验证 Content-Range，再本地组装交给 PDF.js；不支持 Range 时回退整份 GET。大文件同时预取文件头与尾部、复用有效数据；PDF.js 组件加载设独立超时，分段错误立即向阅读器报告并安全终止；记录不含票据和凭证的阶段计时。

首次回归发现 Range 错误响应会导致 PDF.js 内部 promise 悬挂，随后已修正为独立 failed promise，第二次关键 CI 通过：
Private PDF access v1 regression、PDF Vault P1、Private PDF capture v2、Cloudflare migration、Tampermonkey capability、Validate authors/data。

2026-10-08 12:21 左右 PR #404 合并 main，merge SHA 2d2b24875fbdc834359bb6a4f91f11686619c597。Worker 前端同步和发布成功；GitHub Pages 前端仍在自动工作流 #37727105263，等待发布前的分页/Hot Archive 测试，不能在此阶段声称正式站已采用新版。

未经用户账户及本地网络真实 DOI 端到端测量，不能保证 1.3 MB PDF 的实际上线打开速度达标；后续以 Pages 发布和用户真实耗时为最终验收，不需要用户提供 PDF token/私有下载链接。

本次未修改 Tampermonkey、权威文献数据、8:00 正式发布槽或 PDF 权限边界。
