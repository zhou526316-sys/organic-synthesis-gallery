# Organic Synthesis Gallery — Tencent zero-new-cost owner PDF gateway continuation

Beijing time 2026-10-09T00:38:29.731+08:00; user message "继续" following explicit approval of a DNS-only Tencent alternate PDF ingress, zero added fee.

## First visible final fragment
PR #420 的最新关键回归已经完成：私有 PDF、前端阅读器、媒体捕获、Cloudflare 构建及站点质量检查均通过。腾讯云备用线路仍是**默认关闭**状态，因此尚未解决你当前浏览器打不开 PDF 的问题。

下一步要解决的是部署条件，而不是重复修改 PDF 下载算法：确认新域名是否已解析、服务器是否有可用 HTTPS 证书，以及安装脚本能否安全地与现有微信 Nginx 服务共存。

## Second visible final fragment
另外，文件传输恢复路径已有一轮浏览器测试 **35/35 通过**：当 Cloudflare 已授权、但 PDF 文件请求返回临时错误时，阅读器能够改走腾讯云；明确的权限拒绝不会被备用线路绕过。

我又增加了下载通道和 HTTP 429 限流保护测试，最后一轮回归正在执行。限流不能通过更换域名绕过，这是保留账号安全及零费用控制所必需的。

## Other progress
Progress reports in this turn:
- 已确认腾讯云 DNS pdf 子域当前仍未解析到 A（Status 3）；relay.gczhouwld.com 当前指向现有腾讯云 IPv4。
- 发现授权成功、Cloudflare 文件传输失败时现有切换仍不能保证恢复，新增单次 Tencent 文件传输自动重试；401/403/429 严格不绕过。
- 回归通过 39/39 Chromium，包含下载从 Tencent 独立通道获取、失败 fallback 和 429 保护。
- 后端 BoundedServer 最多20客户端线程、上游4并发，nginx 15s Header timeout、安全检测重复 vhost/占用本地端口；Python 9/9、PowerShell AST、Bash syntax pass。
- 所有 Git 变更均只在 feature/owner-private-pdf-dual-ingress-20261008；main 没有因这个项目收到生产代码更改，DNS/腾讯云服务器/公众号 Nginx 都未被助手修改。
- 项目全局硬约束 ¥0 新增费用。

## Final visible continuation
最新阶段已完成：

- 已修复**授权成功但 PDF 文件传输失败**时不能换线路的问题；启用腾讯云后，可按权限重新签发凭证并重试一次。
- 下载改为优先通过腾讯云验证实际 PDF 字节后再导航；明确的 HTTP **401/403/429** 不允许通过备用线路绕过。
- 前端真实 Chromium 回归 **39/39 通过**；后端 Python 安全测试 **9/9 通过**，PowerShell 语法和 Bash 安装脚本检查通过。网关也限制公网慢连接消耗服务器内存。

代码在 [PR #420](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420)。**PR 仍未合并，正式站未启用腾讯云线路**，当前账号打不开 PDF 的问题还不能标记为已修复。

接下来有两个部署前提，其中 DNS 需要你在 Cloudflare 控制台完成一次，因为现有 Cloudflare Token 的 DNS API 权限返回 403：

1. 在 `gczhouwld.com → DNS → Records` 新增：**A** 记录，名称 `pdf`，IPv4 `43.135.32.73`，代理状态 **DNS only（灰云）**，TTL Auto。不要修改 `relay`、`gallery`、`api`。我刚刚再次检查，`pdf.gczhouwld.com` 仍未有 A 记录。
2. DNS 生效后，在 **Windows PowerShell** 直接执行：

```powershell
$src = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/4c901118cb90131e65256da355580eeaf32c202d/deploy/pdf-gateway/run-from-windows.ps1'
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-run.ps1'
Invoke-WebRequest -Uri $src -OutFile $dst -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Preflight -SshUser ubuntu
```

这个 URL 固定在经过审查的 Git 提交，不会随分支后续更新而改变。预检会检查现有 Nginx、443 端口、证书条件、DNS 和腾讯云到 Cloudflare 的连通性；**预检不会安装或重启服务**（SSH 会先在服务器临时目录上传检查所需脚本）。

请先把预检结果发来。若全部通过，再执行同一脚本的 `-Mode Install`；安装会要求输入 `YES`，创建独立 Nginx 虚拟主机并保留公众号站点。缺少免费证书工具或检查失败时会停止，不强行安装付费服务。

**费用约束仍是新增 0 元。** 网关配置了每月 256 MiB 的独立传输预算和并发限制，但这不能代替腾讯云对整台服务器的套餐流量监控：若原有业务耗尽 512 GB 总流量，仍需及时停止网关以避免超额费用。真正启用前还要验证手机网络、家庭/校园网络的登录、第一页、翻页和下载。

## Repository audit of implementation

- PR #420: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420 still open on implementation branch. No main merge or live activation.
- Changes include src/private-pdf-reader.mjs (Tencent authorized file transfer retry, native download path, deny 401/403/429), tests/private-pdf-access-browser.mjs (39 pass), deploy/pdf-gateway/gateway.py (isolated localhost, no credential logs, 20 bounded clients, 4 upstream concurrency and 256MiB quota), deploy/pdf-gateway/install.sh (nginx & certbot gated, WeChat vhost invariant), deploy/pdf-gateway/run-from-windows.ps1 (immutable payload pin), pdf/index.html exact CSP, public/pdf-gateway-routing.json enabled=false, owner capability/account/session login fallback.
- Browser CI succeeded 39/39 at run https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37809394943 and run 37808980741. Backend security (9/9), Bash, PowerShell syntax check succeeded at https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37809871520.
- Up-to-date installer and gateway payload SHA at immutable commit f36fc03b2747f1fbaac2799854b62c04dd594b16; sha matched feature branch files when audited. Windows launcher at commit 4c901118cb90131e65256da355580eeaf32c202d.
- Public DNS status of pdf.gczhouwld.com A at last check: NXDOMAIN, relay A 43.135.32.73. Existing CLOUDFLARE_API_TOKEN Zone read HTTP200, DNS records read HTTP403, no changes possible with it.
- Current PR base changed concurrently; merging before DNS/live gateway test is intentionally deferred. No added paid subscription, no changes to existing WeChat relay, no Cloudflare DNS writes, no private PDF exposure.
