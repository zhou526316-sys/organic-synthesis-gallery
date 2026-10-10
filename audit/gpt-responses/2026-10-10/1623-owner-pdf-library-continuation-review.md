# Project response sync — PDF full-library audit continuation

- Beijing timestamp: 2026-10-10 16:23 Asia/Shanghai.
- Chat context: continuation of deployed PDF full-library verification system after PR #467 and first production audit #38034924971.
- Related audit evidence commit: `c09d306de2668529cf6395103d4c59b2f5dadbb5`.

## Complete user-visible response

已接续 PDF 全库验收工作，并对 `main`、PR #467、首次生产任务日志和管理员报表的实现做了新一轮核验。**这次没有重新部署网关、重复触发全库扫描，或更改每天唯一的 08:00 文献发布任务。**

截至本轮核验，已确认的生产证据仍然是：正式目录 **938 个 DOI**，40 批全部完成对齐；首次运行检查 **120 个 R2 对象，120 个头尾通过、0 个头尾失败**。我直接核对了 [任务 #38034924971](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38034924971) 的作业日志。这不等于 938 份 PDF 均已入库、120 份经过真实浏览器验证，更不意味着剩余 818 份失败。

当前的管理员报表 [PDF 全库验收](https://gallery.gczhouwld.com/pdf-audit.html) 保持独立的 ready / pending / failed / missing 与 R2 pass / failed / untested、人工两页确认标识。逐类实际数量属于 `private_pdf_owner` 私有数据，本轮没有管理员凭据，因此没有猜测这些数值。每日北京时间 **09:17** 的自动验收仍按原工作流配置，不应创建替代的 08:00 或 18:00 发布任务。

代码审查另外确认了四个待处理风险：

1. **来源提交可能显示旧值。** 目录 DOI 集合不变时，重复成功验收会更新完成时间，却可能保留最初的 `sourceCommit`，影响报表溯源。
2. **额外扫描触发过宽。** 除了每日 09:17 定时任务，每次 `main` 上的 Worker 生产部署成功，都可能另外触发一次目录对齐和最多 120 次 R2 检查；工作流并没有真正实现“仅首次部署引导运行”。
3. **同版本失败的恢复复检不够及时。** 某项 R2 读取失败后，如果对象恢复但文档 ID、哈希和大小不变，目前代码可能要到 30 天失效窗口才重新检查。
4. **目录切换期间有快照一致性风险。** 新目录开始写入时，逐 DOI 结果使用共享表；若中途某批失败，旧的已完成目录仍可读取，但部分行可能已由未完成的新批次刷新。

这四项属于**代码层面核实的风险，并非已经观察到的线上故障**。依照项目的“先核实、再批准修改”规则，本轮已记录证据，但没有擅自合并修复代码。后续修复优先顺序是：先保证审计来源记录准确、约束额外的部署触发，再改进有限额的失败重检和快照隔离，并添加对应回归测试。

原有 PDF 体验和权限边界不变：**1 MiB Range 分段、连续上下滚动、画质、账号授权、腾讯约 256 MiB/月的中转预算，以及腾讯自动回退保持关闭**。R2 后台验证与真实 HTTP 206、校园网/家庭宽带/手机网络两页渲染仍要分别验收，不能混成“全库可读率”；无需人工逐篇打开数百份 PDF。

本轮详细证据已保存至 [2026-10-10 全库验收接续审计记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/pdf/2026-10-10-owner-library-audit-continuation-review.md)。本次只提交审计记录，没有修改 PDF 文件、Worker 功能或正式发布配置。
