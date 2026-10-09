# Gallery Tencent owner PDF gateway: Certbot HTTP-01 404 permission incident & remediation

Beijing time 2026-10-09T10:36:44.734+08:00
Project: 抓取有机合成文献并持续更新网页.
User supplied full failed --install log: nginx -t and DNS matching Tencent passed, Cloudflare health 200 ~124ms, certbot HTTP-01 validator received HTTP404 at Tencent direct IP, script emitted [STOP] TLS issuance failed and [ROLLBACK] and SSH exit1. No successful PDF gateway deployment.

## User-visible initial partial
**失败原因已经缩小到 HTTPS 证书验证阶段，不是 DNS、SSH 登录或 Cloudflare 连接问题。**

Let’s Encrypt 访问 `http://pdf.gczhouwld.com/.well-known/acme-challenge/...` 时收到了 **404**，因此无法验证域名并签发证书。

从你的输出看：

- DNS、Nginx 配置检查和腾讯云到 Cloudflare 的连接均正常。
- 证书申请失败后，安装脚本触发了回滚。
- **PDF 网关没有安装成功，Gallery 备用线路仍未启用。**

我发现安装脚本存在一个高度可疑的问题：它以严格的 `umask 077` 创建证书验证目录，可能导致 Nginx 无法读取 Certbot 生成的验证文件，从而返回 404。

**先不要反复运行原来的安装命令。** 我会修复目录权限和证书申请前的验证检查，再给你一次扫码即可执行的更新版本。

## User-visible progress before completion
修复版已经通过第一轮回归：在隔离测试中，原先创建出的 `0700` 目录会阻止普通进程读取文件；改为正确权限后，非特权进程可以读取验证文件。后端安全测试 **9/9 通过**，Windows PowerShell 5.1 的单连接脚本检查也通过。

新安装程序还增加了一个保护：**先用 Nginx 实际读取 HTTP 验证文件，只有读取成功才向 Let’s Encrypt 申请证书。** 如果仍然返回 404，会在申请证书之前停止并回滚。

这验证了修复方向，但尚未在你的腾讯云服务器上重新验收。

## User-visible final
**修复已完成，可以重新尝试安装。** 本轮修复了两处与此次 404 有关的配置问题：证书验证目录原先可能因 `umask 077` 被创建为仅 root 可进入的 `0700`；另外，应用目录也可能具有相同问题，导致后续网关服务无法启动。现在两者都改为适合服务读取的权限，私有配额目录仍保持严格访问控制。

安装程序新增了证书申请前的检查：创建临时验证文件，让 Nginx 通过 `http://pdf.gczhouwld.com/.well-known/acme-challenge/...` **从服务器本机实际读取**；只有返回 HTTP 200 且内容完全一致，才调用免费的 Certbot。检查失败会停止并回滚，不会反复向 Let’s Encrypt 提交失败申请。

专项回归已通过：[GitHub Actions 测试结果](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37875230581)：权限回归通过、网关安全测试 9/9，通过 Windows PowerShell 5.1 对单次 SSH 启动器的真实下载与解析测试。

### 现在执行修复版安装

在**本机 Windows PowerShell** 复制运行下面全部代码。已固定版本，不再使用之前失败的安装脚本：

```powershell
$src = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/c69511b680150fc08edc548ca106449c03ed30a1/deploy/pdf-gateway/run-once-from-windows.ps1'
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-once-fixed.ps1'

Invoke-WebRequest -Uri $src -OutFile $dst -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Install -SshUser ubuntu
```

按提示输入 `YES`，再完成腾讯云的一次 SSH 微信扫码验证；若 `sudo` 需要 Ubuntu 密码，则正常输入。**不用先手动 SSH 登录，也不用手动修改 Nginx 权限。**

成功时应显示 `[CHECK] Nginx HTTP-01 webroot probe passed`、`[SUCCESS] Tencent PDF gateway HTTPS installed` 和 `[COMPLETE] Gateway stage: --install`。如果看到 `[STOP]` 或再次出现 `404`，请停止并把**错误文字**发给我，不要重复尝试旧命令。

这一步仍只安装腾讯云独立 HTTPS 网关，**不会自动启用 Gallery 的 PDF 备用线路**。还需后续验证公网 HTTPS、已授权账号、分段读取和实际 PDF 打开。新增付费仍严格为 0 元，原有 `osg-wechat-relay` 配置不得被覆盖。

## Evidence and implementation, no remote access by assistant
- Earlier installer at f36fc03b... uses global umask 077 and mkdir -p /var/www/gallery-pdf-acme and /opt/gallery-pdf-gateway without explicit directory permissions; previous failed attempt likely left dedicated paths 0700 root-only. nginx unprivileged worker cannot traverse webroot, and gallerypdf user cannot traverse app path.
- GitHub PR #420 branch feature/owner-private-pdf-dual-ingress-20261008 updated install.sh to explicitly install -d -o root -g root -m 0755 on webroot/.well-known/acme-challenge and app path; leaves private quota state 0700.
- Local Nginx HTTP01 probe with temporary fake token + exact returned bytes added before Certbot, fail closed without public CA contact, ACME temporary probe cleaned. Certbot run in separate umask022 subshell. Main nginx site osg-wechat-relay untouched. Installer detects occupied internal port, duplicate vhost, validates nginx -t and triggers rollback on failure.
- New deploy/pdf-gateway/test_acme_permissions.sh reproduces root-only 0700 directories under umask077, repairs to0755, validates sudo -u nobody can read challenge 0644; CI success run 37875230581: ACME_PERMISSION_REGRESSION_PASS + Python gateway9/9 + Windows PowerShell5.1 one-SSH syntax/download passed.
- Tested immutable source commit 5693dd5a43f46cc9fd35842983b308b4c9c08fb5 and fixed Windows launcher commit c69511b680150fc08edc548ca106449c03ed30a1, one SSH, BOM.
- Official Certbot documentation: HTTP-01 webroot challenge must be served at /.well-known/acme-challenge exactly; modern Certbot itself uses temp umask022 and chmod0644 for challenge files (cf https://github.com/certbot/certbot/blob/main/certbot/docs/using.rst and https://fossies.org/linux/certbot/certbot/src/certbot/_internal/plugins/webroot.py). Original problematic root-level directory is the likely root cause; actual host still needs post-repair probe.
- No remote SSH performed by assistant, no paid service purchased, no production Nginx or Cloudflare DNS mutation. Gallery Tencent alternate route remains disabled and PR unmerged; do not claim end-to-end fixed until host installation and domestic network acceptance.
