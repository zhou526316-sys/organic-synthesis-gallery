# GPT response synchronization — Screenshot: PDF authorization still fails

- Beijing time: 2026-10-10 approximately 17:40+.
- Conversation: Organic Synthesis Gallery PDF full-library acceptance follow-up, user asked "真的有修好吗？" with screenshot showing owner PDF open timeout.
- Related source evidence: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/pdf/2026-10-10-private-pdf-open-authorize-timeout-readonly-diagnosis.md
- Evidence audit commit: e8bec732aa87d98e2558b5593577a0143fe8328b.
- No authentication secrets, session values, PDF signed URLs or private DOI inventories included.

## User-visible response: first segment

没有完全修好。你的截图明确证明，当前 PDF 阅读功能仍然存在故障。

截图显示：
- PDF 授权超时：等待 15 秒后，系统仍未取得授权，文件传输根本没有开始。
- 主授权链路失败：15,011 ms 内没有收到响应。
- 备用授权链路失败：11,508 ms 内没有收到响应。
- 腾讯线路未启动：界面显示 `tencent: 未发起`，因此不能认为腾讯线路也已验证失败。
- 主 API 并未完全失联：公开 GET 返回 HTTP 200，但这只能证明部分网络请求可达，不能证明 PDF 授权正常。

938 篇 DOI 的目录对齐和 120/120 次 R2 存储检查通过，不代表 PDF 能正常打开。PR #473 修复的是全库验收系统自身的问题，并没有直接修复截图中的 PDF 授权超时故障。

## User-visible response: second segment

进一步定位：问题出在授权阶段。

重新检查正式仓库的 PDF 阅读器和 Worker 授权代码，确认三点：
1. 阅读器设置了 15 秒授权总时限。主线路在 3.5 秒后启动备用请求，但如果两个请求均未及时返回，便直接报错。
2. 当前腾讯自动备用入口仍为 `enabled:false`。所以即使主、备用 Cloudflare 线路都失败，腾讯也不会自动接管。截图中的“使用腾讯线路试读”只是手动测试入口。
3. Worker 原有的授权分阶段耗时诊断设置了过期时间，截止于 10 月 10 日 00:00（北京时间）。因此，它无法再为此次故障提供有效的分阶段耗时数据。

目前还不能确定授权卡在 Cloudflare 网络、账号会话数据库查询，还是 R2 文件校验。不能简单地把 15 秒超时改成 30 秒就当作修复。

另外，PR #473 的最新专项测试、数据库迁移测试及部署约束测试已经通过，但 PR 仍未合并。它与此次授权故障属于两个独立问题。

## User-visible terminal segment

**这次截图足以认定“PDF 尚未修好”，不需要你重复提交浏览器控制台截图，也不需要手工打开几百篇 PDF。**

已把本次故障核查写入项目审计记录：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/pdf/2026-10-10-private-pdf-open-authorize-timeout-readonly-diagnosis.md

下一轮需要专门修复授权链路，而不是继续改全库 R2 报表。我建议先恢复限时、脱敏的授权阶段耗时诊断，区分浏览器至 Worker 无响应、D1 会话/权限查询、R2 文件头读取和签发文件票据的耗时；根据实测结果修复真正的阻塞点，同时验证腾讯手动备用线路在已授权账户下的第一、第二页、206 Range 和上下连续滚动。验收必须同时保证无权限用户仍被拒绝，且不更改 PDF 画质、分段尺寸或每日 08:00 文献发布。

**依据项目的“先核实、再批准”规则，这个 PDF 授权超时属于新的故障项，前次“可以”只批准了 PR #473 的四项验收系统改动。此次尚未擅自更改生产阅读器。你批准我按上述方案修复授权超时吗？**
