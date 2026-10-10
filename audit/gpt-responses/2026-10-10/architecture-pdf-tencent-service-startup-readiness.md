# ChatGPT response synchronization: Tencent private PDF gateway service readiness

- Beijing local time: 2026-10-10 11:43:50 (UTC+08:00)
- Project conversation: Architecture and PDF deployment; owner supplied real Tencent post-cert TCP 18867 connection refused log
- Branch: feature/owner-private-pdf-dual-ingress-20261008
- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420
- Code SHA: 19fc7851114e6862ef3fb05a51af5b2355726b0b; Windows launch/CI SHA: c494e4ed22e37faf8196bd1cb42ae5beecfcf9b0
- CI passed: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38021482116

## Partial user-visible final response

## 本次部署取得了关键进展

**Nginx 虚拟主机路由：通过；ACME HTTP-01 文件验证：通过；免费 HTTPS 证书：已成功签发；Python PDF 网关服务：尚未就绪。**

新证书对应 `pdf.gczhouwld.com`，有效期至 **2027 年 1 月 8 日**。这意味着此前的 Nginx 和证书申请障碍已经解决。

当前失败的位置是：

```text
curl: (7) Failed to connect to 127.0.0.1 port 18867
[STOP] Local health failed
```

从安装代码看，存在一个需要修复的时序缺陷：`systemctl is-active` 返回成功后，脚本立即请求 Python 服务。但 systemd 认为进程已经启动，不等于应用已经完成初始化并监听端口。

这是**可能的启动竞态**，尚不能排除 Python 进程启动后崩溃。需要同时修正就绪检查和失败诊断，而不是简单增加固定等待时间。

证书已经签发，后续应优先复用，不需要反复向 Let’s Encrypt 申请。安装失败后的 PDF 网关仍处于回滚状态。

## Terminal response

### 服务启动检查已修复并通过回归测试

已修订 PDF 网关安装脚本：原来只调用一次 `curl`，现在改为最多 15 次有界本机就绪检查，只有 `127.0.0.1:18867/_pdf_gateway_health` 返回预期 HTTP 200 和完整匿名健康 JSON 才继续 HTTPS 部署。如果 Python 服务持续拒绝连接、崩溃或返回错误内容，就会输出 `[DIAG] LOCAL_GATEWAY_NOT_READY`、systemd ActiveState/SubState/退出状态/重启次数和有限白名单的错误类别，并停止、回滚；不会泄漏原始 journal、账号 token 或私有 PDF URL。

隔离测试验证：最初连接拒绝、第二次健康内容不正确、第三次恢复正常能通过；永久失败能按预期给出脱敏诊断。Linux Nginx/网关安全回归和 Windows PowerShell 5.1 单次 SSH 校验全部通过：[CI #38021482116](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38021482116)。代码位于独立 [PR #420](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420)，没有自动合并或开启生产 PDF 备用路由。

### 在 Windows PowerShell 中执行修复后的安装入口

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/c494e4ed22e37faf8196bd1cb42ae5beecfcf9b0/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-service-ready-fixed.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

这次仍需输入 `YES` 并进行一次微信扫码 SSH 登录。有效证书应被复用，不必再次申请。成功应看到 `[CHECK] LOCAL_GATEWAY_READY`、`[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]`（各检查以实际日志为准）。如出现 `[DIAG] LOCAL_GATEWAY_NOT_READY` 或 `[STOP]`，发送该段脱敏输出即可，不需要分享密码、扫码 URL、token 或完整 journal。

本次不改变 PDF 文件分段、画质、上下连续滚动、账号权限或手机访问规则。即使 HTTPS 网关安装成功，也必须在中国移动数据网络实测另一账号的授权、跨账号拒绝、Range 206 和真实文件读取成功之后，才能考虑开启 `enabled:false` 的备用线路。
