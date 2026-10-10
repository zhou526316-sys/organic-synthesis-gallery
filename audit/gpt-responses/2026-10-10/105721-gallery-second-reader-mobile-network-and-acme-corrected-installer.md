# Gallery phone-cellular second reader and Tencent PDF ACME recovery — response synchronization

Beijing timestamp: 2026-10-10 10:57:21
Project context: User reports newly granted second Gallery account testing PDF from mobile cellular data, independent of campus VPN+Ghelper US laptop. Exact image diagnostic is not available via mount; user-visible response carefully avoids claiming a specific mobile error.
Git evidence: draft PR #420 head eecbc931d1c94f3723628ab300a6a1d1a384ce94; one-SSH Windows launcher pins bc50cc94f6a83fdd85a579442b8c4a5ee6b10784.
Isolated gateway regression #38018606704: Linux security and Windows PowerShell 5.1 both success, including localhost Nginx address-precedence HTTP404->200 fixture.
Production gateway: not installed, routing enabled=false; WeChat vhost not modified by this turn.
Private data: no password, session cookie, token, raw URL, third-party email, school identity or private PDF content in repo record.
Related audit: audit/pdf-gateway/2026-10-10-acme-http01-404-vhost-loopback-fix-and-mobile-comparison.json.

## Full user-visible answer

这次手机测试非常关键：**它使用的是另一个刚获授权的账号，而且走手机自身的数据流量**，与电脑上的校园网、学校 VPN 和 Ghelper 美国节点是不同的访问环境。

如果手机也打不开，就不能再把故障全部归咎于你电脑的代理或校园 VPN。不过两个人用的是不同账号，还必须区分：

- 手机显示 `401`、`403`、`not_authenticated` 或 `private_pdf_not_entitled`：优先检查该账号的登录会话与实际阅读权限。
- 手机显示 `pdf_authorize_timeout`：问题在获取私有 PDF 授权。
- 手机显示 `pdf_transfer_timeout`：授权已进入后续文件传输阶段，两种网络都遇到问题，更支持排查共同的 Cloudflare 文件链路。

**腾讯独立网关方面已有进展。** 我针对你刚发来的服务器日志修复了 ACME 证书预检返回 404 的另一种原因：现有 Nginx 如果单独监听 `127.0.0.1:80`，可能覆盖新 PDF 站点的通配监听。新的隔离 Nginx 测试复现了 **404 → 200**；[Linux 网关安全测试及 Windows PowerShell 5.1 测试 #38018606704](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38018606704) 现已全部通过。

这仍是隔离测试，**真实腾讯服务器尚未再次安装成功，PDF 备用路由仍保持关闭**。接下来可以由你在自己的 Windows PowerShell 上运行修正后的单次 SSH 版本，不需要对方账号操作，也不需要更换学校 VPN 或代理：

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/eecbc931d1c94f3723628ab300a6a1d1a384ce94/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-one-ssh-fixed.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

脚本仍需输入 `YES` 并完成一次微信扫码 SSH 登录。它会在申请免费证书前验证真正的 ACME HTTP 响应，失败则停止并回滚；不会覆盖微信中继虚拟主机，也不会自动开放私有 PDF。完成后把 `[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]` 或 `[STOP]` 的末尾状态发给我即可，不要发送密码或带 `token=` 的链接。

**另外请确认手机截图显示的具体错误代码是哪一个**（例如 `pdf_transfer_timeout`、`pdf_authorize_timeout` 或 `403`）。这个信息能决定是否还需单独核对第二个账号的权限，而不会误把权限故障当作网络故障。

这次仍不修改 PDF 的分段大小、画质或连续滚动方式。
