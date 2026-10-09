# Project response record — Tencent PDF acceptance/handoff

Beijing time: 2026-10-09 14:10:06
Context: Gallery architecture continuation, user approved independent Tencent PDF gateway China-first readiness test and conditional activation
Related PR: #420 (Draft)
Tests: #37891328515, #37891507915, #37891932792
Commit of reviewed Windows installation launcher: cae30a94be56747f7405ee25783261accedc9f36
Current limitation: interactive Tencent SSH WeChat QR needed, TLS SAN mismatch, no live owner PDF acceptance

## Partially sent user-facing content

## 腾讯备用 PDF 网关：第一轮检查结果

DNS 域名解析通过：pdf.gczhouwld.com 和 relay.gczhouwld.com 都解析至 43.135.32.73。
HTTPS 证书验证未通过：ERR_TLS_CERT_ALTNAME_INVALID。
正式 PDF 备用线路暂未启用；两条现有 Cloudflare 路径保留。

这说明 DNS 已到位，下一步重点是腾讯服务器的 Nginx 虚拟主机和独立 TLS 证书，而不是重新开发 PDF 阅读器。测试来自海外 GitHub Runner，尚不属于中国大陆运营商的实际验收。

## Terminal user-facing response

进一步核验确认，腾讯云当前返回的是 **`relay.gczhouwld.com` 专用证书**，并未包含 `pdf.gczhouwld.com`。因此，尽管两个域名已指向同一腾讯云 IP，备用 PDF 线路仍不能安全启用。[公网证书验证记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37891507915)

我已把安装后的 **Windows 实网 HTTPS 与匿名访问保护检查** 整合进单次 SSH 脚本，并通过 Windows PowerShell 5.1 与网关安全回归。[验收运行 #37891932792](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37891932792)。仓库主线没有启用该网关，PR #420 仍为 Draft。

现在需要你在**自己的 Windows PowerShell** 中执行一次安装，因为腾讯云 SSH 登录必须经过你的微信扫码。这一步无法通过 GitHub 的无人值守测试代替。使用以下已固定版本的脚本：

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/cae30a94be56747f7405ee25783261accedc9f36/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-one-ssh.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

脚本会先要求输入 `YES`，再进行一次腾讯云 SSH 微信扫码登录（如服务器要求，还需输入 sudo 密码）。它会检查现有 Nginx 配置，为 PDF 子域名尝试申请免费证书并安装独立网关，不覆盖公众号中继站点。安装后还会在你的 Windows 网络执行正常证书验证、公开健康检查和匿名 PDF 请求返回 401 的检查；不读取或输出你的账号令牌。上面的执行策略仅作用于新启动的 PowerShell 进程，不永久修改系统设置。

请把运行结束后的 `[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]` 或具体 `[STOP]`／`[FAIL]` 提示发回来，**不要发送密码、Cookie 或 PDF 授权链接**。完成后还必须用真实已登录账号验证 PDF 的 206 分段读取、连续滚动和下载，并检查国内不同网络，才能考虑开启备用路由。腾讯云网关即使启用，上游仍依赖 Cloudflare，不能保证所有网络在任何时候都可访问。
