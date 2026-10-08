# OL / ACS Catalysis 抓取退化：根因说明及修复状态
北京时间：2026-10-08 23:29 +08:00
问答上下文：用户问“明明之前acs的期刊都能抓到，为什么这次OL和ACScat都很多没抓到？”
已核对：主站上传的23:11 TOC日志、逐 DOI 正式 Tampermonkey 报告、main 当前控制器/上传代码、PR #418。
证据审计：audit/tampermonkey/2026-10-08-acs-ol-acscat-capture-regression.json
相关 draft PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/418

## 用户可见回答（跨本轮 partial/terminal 回复合并）
这次 Organic Letters（OL）和 ACS Catalysis 大量抓取失败，不是因为 ACS 的文献突然都无法访问，也不是原来的 ACS 抓取算法完全失效。主要是新版任务调度、页面绑定、媒体上传和 PDF 处理之间出现了问题。

同一轮日志中存在真实成功案例和真实失败：OL 10.1021/acs.orglett.6c03763 获得 TOC 和 7/7 正文图；10.1021/acs.orglett.6c03955 获得 TOC、3/3 正文图及已存 PDF；10.1021/acs.orglett.6c03611 有多次出版社脚本心跳缺失，另一次成功核验原 TOC 早已可用；ACS Catalysis 10.1021/acscatal.6c06183 报告成功；10.1021/acscatal.6c05658 的 TOC 成功但正文图 0/4 与 PDF 上传失败；10.1021/acscatal.6c06279 正文图 2/6，TOC 和 PDF 上传失败；10.1021/acscatal.6c04987 遇到访问验证。

进一步逐篇报告明确显示：OL 10.1021/acs.orglett.6c03640 已取得约 289 KB 的 TOC 图像，发现 5 张正文图但只保存 1 张；TOC 和正文图上传请求约 14 秒后超时。约 2.21 MB 的 PDF 已从出版社下载到浏览器，随后上传失败。ACS Catalysis 10.1021/acscatal.6c06279 的 TOC 图像约 275 KB 已找到但上传失败，正文图 2/6；约 2.61 MB PDF 浏览器获取 HTTP 200 后，经 GM 请求约 45 秒和浏览器回退约 30 秒均失败。ACS Catalysis 10.1021/acscatal.6c05658 的 TOC 已保存，正文图检测 4 张却 0 张成功入库，约 1.95 MB PDF 浏览器下载成功但两种上传路径均失败。因此核心瓶颈之一是数据传向 API/R2 时超时及回执缺失，不能把上传失败当作出版社没有图或 PDF。

代码层确证：Publisher 页绑定失败时旧版 uploadReport 缺少服务端必需的 controllerRevision，因而产生部分 409 stale_controller_revision，不能把所有 409 视为用户没更新版本。这一错误以及无关出版社标签页错误上报、Figure 1 已生产验收仍被算作缺 TOC、日志缺安装修订信息已修复并提交 draft PR #418；RSC 真正第一方目录/搜索页的 DOI 绑定读取也纳入该草稿。该草稿未发布，且上传超时的根因并未因此解决。

此外，较早的流程更接近 TOC 优先；2026-10-01 起，真实缺项访问已要求顺带尝试正文图、全文证据和 owner 私人 PDF。新流程请求更多，完整闭环的判据不同。多个阶段失败会让整篇 DOI 显示未补齐，即使某一媒体层已经成功。ACS 则默认后台打开任务标签页，并以心跳判断脚本是否启动；后台限制、跳转或扩展脚本加载可能导致心跳缺失，但目前日志不够证明具体原因，也不能将其直接归因出版社限流。

当前恢复重点应是：先保证已经发现的 ACS TOC/正文图有可核对的服务器存储回执，并隔离图像与 PDF 上传的失败原因；随后逐层补齐既有真实缺项、复用已存媒体与私人 PDF，严禁缓存未知变成重下令。真实访问拒绝保持保护。只处理 addedDate >= 2026-10-01 文献。不应仅提高超时或者增加重复重试就宣称解决。PR #418 已有多数源代码回归通过，仍在 CI/owner VPN 验收阶段，不能宣称全部修复或已上线。用户不必清除 Tampermonkey 数据和此前抓取成果。

## Git / 状态
- main 生产 Bridge 2.2.72 / TOC install 6.2.53 / protocol 6.2.20 / controller 2.2.41.
- PR #418 latest code head 32b97113ba2507fea517815138565a5c158fa78a；截至本轮检查 20 工作流中 17 成功、3 仍在执行、0 失败。不得把“17 成功”称作最终通过或真实抓取验收。
- 仅审计 main 记录，此聊天尚未触发生产 Tampermonkey 更新，不删除任何媒体或 PDF。
