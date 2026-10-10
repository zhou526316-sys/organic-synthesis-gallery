# Tencent PDF HTTPS localhost SNI mismatch: response synchronization

- Beijing time: 2026-10-10 13:01:57 (UTC+08:00)
- Project context: PDF gateway owner one-SSH deployment, curl(60) during local HTTPS health check
- Branch: feature/owner-private-pdf-dual-ingress-20261008
- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420
- Code source SHA: f8653cf1be5f5049e3abfdd2e758b91b77b16aad
- Fixed Windows launcher SHA: 971291ca2041086ee59ec968ceff40fd2b6d3868
- Latest all-pass Linux+Windows CI: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38026022855

## User-visible answer, previously streamed

### 这次已经通过了三道关键验收

Nginx/ACME passed; free HTTPS certificate was issued and reused; Python gateway returned LOCAL_GATEWAY_READY on attempt 2. The independent alternate PDF route remains disabled. Curl 60 was raised because local 127.0.0.1:443 TLS returned a certificate whose SAN did not match pdf.gczhouwld.com. This does not show Certbot failed. The failure might result from Nginx's more-specific 127.0.0.1:443 relay listener outranking PDF wildcard, or inherited proxies. Existing server log did not identify which; must verify in real Tencent.

### 已在隔离 Nginx 中复现同一种证书错误

Actual Nginx and two local test certificates reproduced curl (60) hostname mismatch when relay held a more-specific loopback TLS listener and PDF listened only on wildcard; adding PDF-specific loopback TLS listener corrected the response and preserved relay HTTPS. Branch patch adds `listen 127.0.0.1:443 ssl;`, prevents proxying TLS local health checks via `--noproxy '*'`, keeps normal certificate verification (never `-k`), checks exact HTTPS response with bounded retry and prints only sanitized certificate-match comparison. Tests are isolated proof, not live Tencent installation.

## User-visible completion

### 本轮修复与测试

新脚本只修改独立 PDF 网关的 Nginx 配置：让 `pdf.gczhouwld.com` 的 HTTPS 虚拟主机加入本机 `127.0.0.1:443` 地址组，保留原有对外 443 监听及微信中继配置、证书文件。`curl` 本机健康验证强制绕过代理，严格验证合法证书与域名，并检验预期健康响应，不使用 `--insecure`。失败会显示 `LOCAL_TLS_SNI_FAILED` 和是否发生 `TLS_LOOPBACK_CERT_MISMATCH`，然后回滚。

Linux 实际 Nginx/OpenSSL 回归成功复现 curl(60) → 完整可信 HTTPS 200，确认微信域名与证书访问保持有效；PowerShell 5.1 单 SSH、现有私有 PDF 安全回归均通过。CI https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38026022855。

### 下一次仅运行此固定版

Windows PowerShell 粘贴四行，不要加花括号：

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/971291ca2041086ee59ec968ceff40fd2b6d3868/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-local-https-sni-fixed.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

输入 YES 并微信扫码一次 SSH。已签发的 pdf 域名证书应继续复用。期待 `[CHECK] LOCAL_GATEWAY_READY`、`[CHECK] LOCAL_TLS_SNI_PASS`、`[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]`，若 `[DIAG]` / `[STOP]` 则仅分享这些脱敏行，勿分享密码、扫码 URL、PDF token。

这是备用网关安装，不是开启 Gallery 路由。仍需真实账号授权、拒绝未授权跨账号访问、PDF Range 206、不同手机移动网络下载/翻页后才能另行考虑启用。PDF 分段、清晰度和上下连续滚动均不改变。
