# Cloud VM + aTrust validation and provider recommendation

Beijing time: 2026-10-04 16:55 +08:00
Context: Organic Synthesis Gallery — validating aTrust on an always-on cloud computer

结论：先不要购买长期服务器。先用 Azure 免费额度做 72 小时 aTrust 云端验证；验证通过后，如必须把长期成本压到人民币 50 元/月以内，优先考虑腾讯云轻量 Windows 2C2G（购买页确认所选地域 Windows 镜像可用）。如果允许约 65 元/月，2C4G 会明显稳定。OpenAI Dots/Work Cloud 适合作为调度与监督层，不适合作为学校 aTrust/VPN 的固定生产节点。

原因：
- OpenAI 官方说明 dot 有自己的 cloud computer，Work cloud browser 在本地电脑关闭后仍能继续任务；但 dot 的 cloud computer 不会自动继承本地 VPN、浏览器登录或设备策略，遇到需要登录/确认时任务会暂停。它不是可由用户长期控制固定 IP、固定 Windows 驱动和 VPN 路由的 VPS。
- Azure 当前提供新账户试用额度；免费账户前 30 天有 200 美元额度，部分 Windows VM 在前 12 个月有每月免费时数。Azure for Students 当前提供 100 美元额度/12 个月且无需信用卡，适合短期验证。
- 腾讯云 2026-09-24 的轻量应用服务器官方价目表中，中国内地 2C2G/50GB/4Mbps 为 48 元/月；海外 Windows 表中 2C2G 入门型也有 44/48 元/月档。2GB 内存只适合单浏览器、低并发 collector；2C4G 更可靠但当前约 65 元/月（中国内地）。
- Oracle Always Free 的长期免费计算主要是 Linux/AMD Micro 和 Arm A1，不适合作为需要 Windows/aTrust 客户端的首选节点；可以做调度器但不建议做授权抓取节点。

72 小时验证方案：

1. 创建一台临时 Windows 云 VM。优先用 Azure 免费/学生额度，测试时可开 2C4G，而不是为了省钱先用 1GB 内存。
2. 只从学校官方入口下载并安装与你当前电脑相同的 aTrust 客户端。不要把账号、密码、cookie 写入 GitHub、PowerShell 或日志。
3. 在 VM 上登录 aTrust，确认 VPN 建立后分别访问 Nature、ACS、Wiley/JACS/Angew 中至少 3 个你本地校园 VPN 可访问的订阅全文页面，并实际打开 HTML full text 与 PDF。
4. 退出 RDP 窗口但不要 Windows Sign out。2 小时后重新连回 VM。若授权仍在，说明 RDP 断开不会破坏 session。
5. 运行 12–24 小时无人值守采集测试：每 30 分钟由 Playwright 访问 3 个测试 DOI，记录 canonical DOI、HTTP/页面状态、是否得到 full text、PDF 是否能下载，以及 aTrust session 是否仍 active。
6. 第 24 小时重启 Windows。VM 启动后检查 aTrust 是否能自动启动/自动恢复授权；如果每次重启都要求短信、扫码、MFA 或人工点击，则不能达到真正无人值守。
7. 第 48–72 小时继续空闲，不远程登录，让采集器自己跑；同时测试 Cloudflare R2 上传、GitHub API、学校 DNS、出版社访问是否都正常。
8. 最终只看四项 PASS：重启后无需人工恢复、72 小时不需要重新 MFA、出版社订阅全文/PDF持续可访问、采集结果可以持续上传 R2。四项全过才把它定义成 production collector。

VM 上的基础诊断可使用：

Get-Service | Where-Object { $_.Name -match 'atrust|sangfor' -or $_.DisplayName -match 'atrust|sangfor' }
Get-Process | Where-Object { $_.ProcessName -match 'atrust|sangfor' }
ipconfig /all
route print
Resolve-DnsName <学校VPN域名>
Test-NetConnection <学校VPN域名> -Port 443

测试矩阵：
- aTrust 安装被 Windows Server 拒绝：云 VPS Windows Server 路线失败，需要正式 Windows 10/11 云桌面或校园常开节点。
- 安装成功但云 IP 无法连接学校 VPN：换中国内地腾讯云再试；海外 Azure 的失败不能证明国内 VM 也会失败。
- 登录成功但每次 reboot 要 MFA：只能半自动，不能作为完全无人值守节点。
- 登录成功、重启自动恢复、72h 不掉线：可以正式接 Gallery。
- VPN 全隧道导致 GitHub/R2 不通：抓取和上传要拆分，先写本地 spool，再由非 VPN 出口/第二节点上传。

推荐顺序：
A. 零成本验证：Azure Free / Azure for Students。
B. 低成本生产：腾讯云轻量 Windows 2C2G，目标约 48 元/月；只运行 aTrust + collector daemon + 单个 Playwright browser，GitHub Actions 继续在云端跑，不在 VM 上跑 self-hosted runner。
C. 稳定生产：腾讯云 2C4G，约 65 元/月，如果 2GB 经常 memory pressure/OOM，直接升这一档。
D. 免费辅助节点：Oracle Always Free Linux，做 DOI queue/orchestrator/health monitor，不承担 aTrust。

OpenAI Dots 的定位：
- 适合：监控 GitHub 状态、发现 queue 卡住、触发 workflow、检查线上结果、总结 Evidence、生成/审核每日微信稿，甚至在你的主电脑关闭后继续做 cloud-browser 任务。
- 不适合：作为固定学校 VPN endpoint、长期保存 aTrust 驱动/隧道路由、要求固定公网 IP/固定 Windows 服务的 collector。
- 原因：官方说明 dot cloud computer 不继承本地 VPN/设备策略，并且 web task 在需要登录或确认时会暂停。因此它可以成为“自动化总管”，但不应该成为“机构授权网络出口”。

如果 aTrust 72 小时测试通过，最终架构应是：
GitHub/Cloudflare DOI Orchestrator → Tencent/Azure Windows Collector (aTrust + Playwright) → private/public R2 → media/full-text/PDF verification → Gallery → scheduled summaries → WeChat publisher。
Dots/Work 可以放在最上层作为监督与异常处置 agent，而不是放在数据面。

Sources:
https://help.openai.com/en/articles/20001530-getting-started-with-your-dot
https://help.openai.com/en/articles/20001554-manage-dots-in-chatgpt-workspaces
https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt
https://azure.microsoft.com/en-us/free/
https://azure.microsoft.com/en-us/free/students/
https://cloud.tencent.com/document/product/1207/73452
https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
