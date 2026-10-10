# GPT response sync — Architecture / private PDF Tencent gateway

- Beijing time: 2026-10-10 11:11 CST
- Chat context: 继续架构与PDF，腾讯网关第三次 ACME HTTP-01 404、手机蜂窝网络独立账号待分层诊断
- Related PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420
- Functional branch head at CI: 3d9362036044f43d2b7299a041cfc206b599bf60
- Immutable installer source pin: b36ef315849d4e1bdb4ddc412d0388dd1d659ef0
- CI result: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38019486535 (Linux and Windows PS5.1 success)

## User-visible response, substantially retained

### 一、最新日志的诊断结论

Server available memory about 1.3 GiB; disk free 31 GB; upstream API HTTP 200. ACME directory permissions 0755 and file 0644, so directory permissions do not explain this 404. Current live sockets shown are 0.0.0.0:80 and [::]:80, so the earlier isolated 127.0.0.1 precedence theory is not confirmed on real Tencent. Nginx returns HTTP 404 for a real local ACME canary. nginx -t checks syntax, not effective routing or include. Certbot was not called, PDF-only config was rolled back, and the separate fallback route was not enabled. No PDF.js, chunk size or image-quality changes needed to diagnose HTTP-01.

### 二、代码修订和测试结果

Changes committed to independent PR #420 (not main): check whether marked PDF vhost is actually in effective nginx -T; add filtered read-only Diagnose mode; replace ambiguous literal dollar suffix in canary with a numeric shell PID; add isolated 404->200 nginx include regression. Linux security regression and Windows PowerShell 5.1 one-SSH raw download/parse both PASS in run #38019486535. These are isolated tests, not installation success. The Tencent VM was not modified from this chat.

### 三、下一步：只读 Diagnose（一次 SSH/微信扫码）

Run this in local Windows PowerShell. Do not retry the previous -Mode Install until the live Nginx inclusion/listen routing cause is known.

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/3d9362036044f43d2b7299a041cfc206b599bf60/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-nginx-diagnose.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Diagnose
```

This one-session Diagnose does not install a gateway, request a certificate, reload nginx, access a private PDF or enable routing. It outputs only filtered [DIAG] effective nginx file paths, HTTP listen/server_name mapping, systemd MainPID and port listener process. Ask for [DIAG] output, not entire nginx -T contents, credentials, QR URLs or token-bearing links.

The second mobile account using mobile data is an independent network/access test. The submitted log contains only Tencent deployment output, not the mobile error code. If mobile code is 401/403/not_authenticated/private_pdf_not_entitled, inspect that account's session/entitlements; if pdf_authorize_timeout, investigate origin authorization; if pdf_transfer_timeout, investigate file delivery and shared Cloudflare upstream. Do not ascribe both networks to campus VPN without evidence. Preserve 1 MiB Range, normal continuous scroll and PDF quality.

### Safety / status

PR branch public/pdf-gateway-routing.json still has enabled:false; source branch remains PR-only. No main merge or production switch; no PDF rights bypass or WeChat relay changes. No new paid service. Live Tencent root cause needs returned read-only diagnostic evidence. No guarantee of cross-network PDF availability is asserted.
