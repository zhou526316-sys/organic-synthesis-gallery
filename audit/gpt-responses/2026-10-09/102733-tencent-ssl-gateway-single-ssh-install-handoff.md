# Gallery PDF 网关正式安装：一次 SSH 扫码 Windows PowerShell 交付记录

Beijing time: 2026-10-09T10:27:33.008+08:00
Project thread 抓取有机合成文献并持续更新网页, user provided successful one-SSH read-only preflight and wants work to continue.

## 用户可见的首段回复
你的服务器预检已通过主要安全条件：

| 检查项 | 结果 |
|---|---|
| DNS 指向现有腾讯云 | 通过 |
| Nginx 配置检查 | 通过 |
| 微信中继站点 | 保留 |
| PDF 网关端口 18867 | 空闲 |
| 腾讯云访问 Cloudflare | HTTP 200，约 118 毫秒 |
| 免费证书工具 certbot | 已安装 |
| PDF 专用 HTTPS 证书 | 待申请 |

**目前可以进入安装阶段，无需新增服务器或付费服务。** 安装时需要为 `pdf.gczhouwld.com` 申请免费的 HTTPS 证书，并新增独立 Nginx 虚拟主机。

我已把安装方式改成**一次 SSH 连接、一次微信扫码**，不再重复进行 SCP 上传验证。正式 PDF 自动切换仍保持关闭，直到新网关完成验收。

## 用户可见的最终接续
新的单连接安装脚本已经过**Windows PowerShell 5.1 实际下载与解析测试**，后端 9 项安全测试也全部通过。此前反复扫码的旧脚本不再使用。

现在在**本机 Windows PowerShell**（`PS C:\Users\asus>`）复制执行：

```powershell
$src = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/cd3576e2be963c3bda65c9e4294b5fee6515282f/deploy/pdf-gateway/run-once-from-windows.ps1'
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-once.ps1'

Invoke-WebRequest -Uri $src -OutFile $dst -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Install -SshUser ubuntu
```

执行流程：先在本机输入 `YES` 确认安装，然后按腾讯云要求进行**一次 SSH 微信扫码验证**；如果 Ubuntu 的 `sudo` 另行要求密码，按正常提示输入。脚本会在同一次 SSH 连接中获取固定 Git 版本的安装文件，并在服务器端检查 Nginx、申请免费 HTTPS 证书、创建仅监听本机的 PDF 服务，最后验证 `https://pdf.gczhouwld.com/_pdf_gateway_health`。

**保护条件：**不会购买服务器或其他付费服务；不覆盖 `osg-wechat-relay`；在 `nginx -t`、免费证书申请或服务健康检查失败时停止并尝试回滚本次新增的站点配置。网关设置了 **256 MiB/月** 的独立传输上限，仍需监控现有服务器的总套餐流量以严格避免超额费用。

目前 HTTPS 健康地址仍未对外可达，说明**尚未真正安装成功**。这次安装完成后，预期输出包含 `[SUCCESS] Tencent PDF gateway HTTPS installed, Gallery failover NOT switched on.`。请把最后的成功或错误输出发给我（不要包含扫码二维码、密码或一次性登录链接），我再核查正式 HTTPS、权限及 PDF 分段读取，然后决定是否安全启用 Gallery 自动切换。

## 已核实信息
- 用户贴出 Windows PowerShell 一次 SSH Bash 预检结果：DNS pdf / relay 同指向原腾讯云机器；sudo -n nginx -t 成功，sites-enabled 只有 osg-wechat-relay，目标证书 pending，certbot 在 /usr/bin/certbot，18867 空闲，Tencent->Cloudflare /api/_healthcheck 200 共 0.1176s。
- 用户之前明确批准在现有腾讯云 VM + DNS-only 独立站点安装私有 PDF 备用入口，必须零新增付费且保持公众号站点不中断。
- 老版 PS 预检工具重复登录四次，用户反感；新版 deploy/pdf-gateway/run-once-from-windows.ps1 唯一 ssh.exe，无 scp.exe，多文件走远端 pinned raw.githubusercontent.com 下载，部署需用户 YES + 腾讯云扫码; 失败脚本自行回滚。
- 安装脚本 pin f36fc03b2747f1fbaac2799854b62c04dd594b16；one-SSH launcher immutable at cd3576e2be963c3bda65c9e4294b5fee6515282f。
- Windows-latest powershell5.1 raw downloader + AST + exactly one ssh regression passed run 37874518296; Python gateway 9/9 passed same run.
- 只读公网 https://pdf.gczhouwld.com/_pdf_gateway_health 检查 target_unreachable，尚未安装。
- 项目代码都在隔离 PR #420，未合并，Gallery 自动切换 manifest `enabled:false`；用户真实网络中未实测上传、登录/授权/文件，不能声称问题已修复。
- 网关独立额度 256MiB/month 不等于 VM 所有套餐 512GiB 的总额硬停，因此不能保证 0 元超额计费；在既有流量包余量内可控制 PDF 增量，运营仍需监控 VM 用量。

