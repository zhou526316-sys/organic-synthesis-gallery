# PDF Tencent production gateway: installed, external TLS/401 pass, owner Range acceptance pending

- Beijing time: 2026-10-10 13:09:11 (UTC+08:00)
- Context: architecture/PDF window; user supplied `[SUCCESS]` + `[WINDOWS HTTPS PASS]` + `[WINDOWS SECURITY PASS]` one-SSH install log
- PR420: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420
- Diagnostic repo changes: d4f1a5a36be8ae3b4976692158d665981cc49171, 8e488a5e8803bc8d901b5fae7e04680ece879943, e70fc8f24cbe8ce01d3d9613d99eed53e27c4259, d5b104c9142e82dd958450e75c734bc096fca09d, f83ada3666fe85cde75f411949e5f42df02734cb
- Latest isolated CI https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38026452087 SUCCESS

## User-visible response — first partial

## 腾讯 PDF 独立网关已成功部署

**真实腾讯服务器安装成功，并通过了 Windows 外部网络的 HTTPS 与基础安全验收。**

Real observations: Python ready, Nginx HTTPS service and certificate trusted, Windows external health returned HTTP200 and CORS (1396ms health response), no-ticket private PDF request returned 401. The Windows health timing is not PDF transfer speed. Range 206, cross-account authorization and China mobile cellular remain untested. Automatic Gallery failover remains disabled; no reinstall or certificate renewal needed.

## User-visible response — second partial

## 下一阶段：真实 PDF 文件验收

Current feature flag `public/pdf-gateway-routing.json` is `enabled:false` and PR #420 is not merged. The independent gateway branch's PDF-reader file has diverged from newer main authorization-body/range handling. Do not merge stale reader over current main. First verify authorized file can be read through deployed gateway, then forward-port only necessary fallback code to latest main without altering PDF smooth/continuous scrolling or performance work.

## User-visible completion

### 最小真实验收已准备好

已经在 PR #420 内增加不会泄漏凭据的只读授权测试脚本，并通过 Linux/Windows CI 回归（包括模拟 206、403、非授权文件主机以及非 Gallery 来源拒绝）：

https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/feature/owner-private-pdf-dual-ingress-20261008/deploy/pdf-gateway/owner-acceptance-console.js

Test design: run in browser Console from an already logged-in https://gallery.gczhouwld.com desktop session; prompt for an actual stored DOI; use that local session only with the user's OWN https://pdf.gczhouwld.com HTTPS gateway; open authorized file and read ONLY first 16 bytes via Range. Output a sanitized console.table, never user/session token, signed URL, DOI, cookies, or PDF body. Expected live pass fields gatewayHealth HTTP200_verified, authorizeHTTP 200, available true, fileHTTP 206, range206 true, pdfMagic true. CI fixture pass is not live 206 proof. Never share bearer/ticket or raw Network requests.

On cellular phone (Wi-Fi/VPN off) open https://pdf.gczhouwld.com/_pdf_gateway_health and expect the anonymous JSON health response. This proves only the phone-to-Tencent TLS endpoint, not an authenticated private PDF. For the second newly authorized account, later repeat actual DOI read from the second login; authorized second account success cannot substitute for an unentitled 403 denial test.

Automation/activation remains off. Security still requires a real owner 206, unauthorized account negative, read first and second pages, and mobile China-carrier operation. Keep PDF chunk size, quality, continuous vertical scroll and 256MiB/month safeguard. No new paid service, no modifications to 08:00 literature publication.

### Final user instruction

先在手机移动流量下打开上述公开健康链接，反馈是否能够打开。电脑已登录 Gallery 的账号可再复制审核过的测试脚本到浏览器开发者控制台，选择一篇确认已入库 DOI，仅提供不含任何凭据的结果表。我会根据真实返回状态区分授权、文件 206 与移动网络问题；不提前把安装成功当作 PDF 能打开。

User's latest supplied real install conclusion: [SUCCESS], [WINDOWS HTTPS PASS], [WINDOWS SECURITY PASS]. Do not conflate anonymous 401 with valid-ticket authorization or cross-account denial.
