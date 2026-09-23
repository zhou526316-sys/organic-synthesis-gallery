# Bridge 2.2.22 — concrete automatic failure reporting

Context: user says the key is for the assistant to receive more specific failure reasons promptly and formulate fixes, not merely show a progress panel.
Beijing release evidence time: 2026-09-23 10:14:50.388 +08:00. Reply prepared after successful live verification.
Merge commit: b4cc38ff309f2e4143747008fc823770e53851d0 (#143).
Successful deployment: 35809516625. Successful public verification: 35809576656, job 107017883468.
Release audit: 9fb54128ed26b2ed39350c9556f2c593e0a5aaea.
This response creates no background monitoring task.

## Complete user-visible reply

**已经按这个重点升级：2.2.22 现在会自动上报具体失败证据，不再只给一个失败数量，也不再依赖你每次手动上传日志。脚本已正式上线，线上版本和新增功能标记已核验。** fileciteturn622file0L2-L2

**[点击更新 Gallery VPN Bridge 2.2.22](https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.22)**

### 这次已经查明的具体原因

**Nature Communications 那篇只抓到 5／7 张，并不是因为图片不存在。** `10.1038/s41467-026-77963-6` 的 Figure 1、Figure 2 请求明确报了 **`Request was blocked by the user`**：请求被浏览器扩展的连接许可机制拒绝，后面的 Figure 3–7 则保存成功。日志不能确定是哪次点击或哪条既有授权规则造成的，因此不能直接归咎于你的操作。fileciteturn614file0L2-L2

针对它，新版已明确声明 `media.springernature.com` 图片域名，并把这类问题单独标成“扩展连接权限拒绝”。**已有的拒绝授权不能由脚本覆盖；更新后若出现该域名的连接请求，需要确认允许。** 这比反复重试、延长超时或降低清晰度门槛更对症。fileciteturn622file0L2-L2

ACS 则是另一类情况：一些预览／下载候选地址返回 403 或不支持的内容，随后换用同篇文章的 CDN 地址成功。**这些是候选地址失败，不是整篇抓取失败。** 下一步优化应优先选择已经验证成功的图片来源，减少无效请求；这项抓取顺序优化没有冒充本次已完成的功能。fileciteturn614file0L2-L2

### 我以后能拿到什么证据

新版自动记录任务 DOI、实际页面和图片来源、具体图号、失败阶段、请求方式、HTTP 状态、图片类型与尺寸、请求耗时、重试次数和错误详情；没有拿到 HTTP 状态的网络错误会保留“原因未确定”，不会擅自说成 VPN、CORS 或出版社封禁。中途候选失败和最终整篇结果分别记录。fileciteturn622file0L2-L2

还修掉了一个报告丢失问题：**以前先通知“本篇完成”，控制页可能立即关闭文章页，导致报告还没传完。现在先把报告持久保存在本机，再由一直打开的 Gallery 页发送。** 每约 10 秒检查一次待发报告；只有服务器明确确认接收，才显示“已送达”。网络失败会保留并间隔重试，不会混算成抓图失败。10 秒是检查间隔，不是任何网络条件下都能送达的保证。fileciteturn622file0L2-L2

实时面板同时显示当前图号、保存数量、最近错误，以及**“报告已送达／待重试”**。相关的 **16 项自动报告测试、20 项面板测试及原有抓取安全测试均已通过**；你本机更新后的实际自动回执仍需核验。fileciteturn622file0L2-L2

### 你现在需要做的

先暂停当前批次，等任务页关闭后，点击上面的链接**原位更新**；保留密钥和断点记录，刷新唯一的 Gallery 控制页，再点击“继续媒体抓取主线”。面板会自动出现，也可通过“查看实时抓取进度”展开。原来恢复的 83 篇 TOC 保留，正文图仍是先暂存、未自动发布。fileciteturn622file0L2-L2

**自动上报意味着我后续排查时可以直接读取详细报告，不再把你手工整理日志作为常规步骤；它不意味着我在聊天之外全天候逐秒运行并自动修改代码。** 下一轮判断将以服务器确认接收的具体失败证据和最终存储结果为依据，而不是仅凭面板上的成功／失败总数。
