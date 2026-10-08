# Project response sync — PDF Tencent nginx upstream approved-feasibility decision

Beijing time 2026-10-08T23:15:38.279+08:00
Chat: 抓取有机合成文献并持续更新网页; user presented actual Ubuntu terminal read-only verification of Nginx 80/443, nginx active, osg-wechat-relay config name, Cloudflare API healthy.

## Partial reply sent
## 服务器核查结果：备用 PDF 网关具备部署条件

这次结果确认了两个关键事实：

- **Nginx 正在运行**，并占用 80、443 端口。当前启用的网站配置是 `osg-wechat-relay`。这说明应该通过 Nginx 新增独立的 PDF 虚拟主机，而不是启动第二套服务抢占端口。
- **腾讯云服务器到 Cloudflare 连接正常**：正式 API 约 **400 毫秒**，备用 Worker 约 **192 毫秒**，均返回 HTTP 200。

结合此前的 1.3 GiB 可用内存、31 GB 剩余磁盘和 512 GB 月度流量包，现有服务器有条件承担低并发的 PDF 转发任务，**无需新增服务器**。

这证明了“腾讯云 → Cloudflare”链路可用，但还没有证明“中国各类网络 → 腾讯云 PDF 网关”同样可靠。因此还不能宣布你的跨网络阅读问题已经修复。

## Final remainder
## 下一步：搭建独立备用访问入口

目前可以明确采用以下结构：

`Gallery → Cloudflare 主线路／pdf.gczhouwld.com 腾讯云备用线路 → 现有 Worker 授权 → 私有 R2`

备用线路将使用**现有 Nginx 的一个独立虚拟主机**，不抢占 80/443 端口，不替换 `osg-wechat-relay`，也不另建付费服务器。新的 PDF 网关服务只监听服务器内部地址；浏览器连接腾讯云，网关再通过已经实测可达的 Cloudflare 上游读取文件。

这不是简单加一个反向代理地址。还必须处理同一账号的会话、`private_pdf_read` 权限、临时 PDF 地址重写、分段请求（206）、安全 Cookie 和下载。否则会发生“备用线路授权成功，实际文件又跳回 Cloudflare 而打不开”的问题。

**实施的硬约束仍然是新增费用 0 元。** 部署脚本必须先检查现有 Nginx 配置、TLS 证书及端口冲突，自动备份，`nginx -t` 通过后才允许平滑加载新增配置；任何检查失败就停止并保留原有公众号服务。PDF 备用网关还要设定严格的流量上限，避免套餐超额计费。

我已把实测证据和实施边界保存至 [腾讯云 PDF 网关核查记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-tencent-nginx-upstream-verified-implementation-hold.md)。

**请确认是否批准这一具体实施范围：在现有腾讯云服务器新增独立的 PDF 网关和 `pdf.gczhouwld.com` 域名入口，并在备份及检查通过后安全加载 Nginx 配置，同时更新 Gallery 自动切换逻辑？** 获得批准后，我会准备你可在 PowerShell 中执行的完整部署脚本。若现有证书、隔离或流量保护不能满足零费用和公众号不中断要求，脚本会停止，不强行上线。

## Evidence / changes
- User-provided Ubuntu SSH: nginx active, :80/:443 on v4/v6 nginx; only sites-enabled filename osg-wechat-relay; Docker active, Caddy/Apache inactive.
- VM to Cloudflare API health successful: primary HTTP 200 0.400012s; workers.dev HTTP 200 0.191743s.
- Main repo src/private-pdf-reader.mjs uses two Cloudflare-hosted authorization hosts; src/private-pdf-access.ts only canonical API for capability refresh. Worker open returns absolute time-bounded signed file URL and file endpoint uses host-only Secure HttpOnly SameSite=Strict continuation cookie; alternate host must rewrite signed URL and preserve session/security.
- Created immutable audit feasibility file audit/private-pdf/2026-10-08-tencent-nginx-upstream-verified-implementation-hold.md, commit 8e3ae2f796f72c4ecc38f0d05f10c9829d5cc62d.
- No access to user's VM by assistant, no Nginx/DNS/Worker edits, no expenditure or new user privileges, no WeChat relay restart. Hard zero incremental cost remains. Explicit approval awaited to deploy a separate vhost and same-account PDF proxy with guarded Nginx reload, DNS-only PDF host and frontend failover.
