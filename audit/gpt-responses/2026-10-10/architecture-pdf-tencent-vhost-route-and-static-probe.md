# Architecture/PDF: Tencent actual vhost present but HTTP-01 still 404

- Beijing date: 2026-10-10
- Task/chat: PDF Tencent ACME installation after live Webroot vhost 404; continue architecture work
- Branch PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420
- CI passed: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38021041184
- Launcher: 4fb5bea62d9f324401c73dc18ac29784239c69f7
- Immutable install source: 6afee5f44c1ee68b813232eba0036cb0053a541a

## User-visible partial answer

## 本次安装失败的重新诊断

这份日志排除了上一轮最主要的故障假设：**PDF 虚拟主机已经被 Nginx 正确加载，但 HTTP-01 测试仍返回 404。**

现在有三项明确证据：

- `nginx -T` 已包含 `/etc/nginx/sites-enabled/gallery-pdf-gateway`。
- 主配置已经包含 `include /etc/nginx/sites-enabled/*;`，所以不缺少 PDF 站点引入规则。
- ACME 文件存在，文件权限为 `644`，上级目录均为 `755`。

因此，继续修改 `nginx.conf` 的 include 规则没有意义。当前应检查的是：**实际 HTTP 请求进入了哪个虚拟主机，以及 Nginx 为什么没有返回已经存在的测试文件。**

值得肯定的是，安全保护仍在正常工作：Certbot 尚未调用，安装已停止并执行回滚，PDF 备用线路没有启用。

我将针对这次真实日志改进请求路由与静态文件诊断，再进行独立回归测试。暂时不要重新执行旧版安装命令。

## User-visible completion

### 新版网关诊断/修复已提交

这一轮不再依赖“缺少 Nginx include”的假设。新版安装器在申请证书前，分别核对两个独立环节：

1. **实际虚拟主机路由**：新增只返回固定文本的 `/_gallery_pdf_route_probe`。只有正在运行的 Nginx 返回正确标记，才认为 Host/监听及重载生效；失败时输出 `LIVE_VHOST_ROUTE_MISMATCH`。
2. **ACME 静态文件**：将挑战路径改为明确范围的 `alias`，仍只服务公开的 `/.well-known/acme-challenge/`，使用最多六次有界本机读取核验精确文件内容。路由正确但文件失败时输出 `ACME_STATIC_FILE_FAILED`。

原有微信中继虚拟主机文件不改，安装异常时回滚，证书只会在本机 ACME 验证确实返回 200 和精确文件字节之后申请。现有 PDF 阅读授权、PDF 分段、画质、连续滚动均不变。

**隔离测试已通过**：[CI #38021041184](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38021041184)。Linux Nginx 实测了默认微信站点 404、命中 PDF 站点 200、错误静态路径 404、正确静态文件 200 以及无关路径继续 404；Windows PowerShell 5.1 单次 SSH 入口也通过。仍然不是腾讯真实安装成功。

### 在 Windows PowerShell 中运行新版安装器

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/4fb5bea62d9f324401c73dc18ac29784239c69f7/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-vhost-static-fixed.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

输入 `YES`，再完成一次微信扫码 SSH 登录。日志成功时会出现 `[CHECK] LIVE_VHOST_ROUTE_PASS`、`[CHECK] Nginx HTTP-01 webroot probe passed`，后续才可能看到 `[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]`。如果仍失败，请把 `LIVE_VHOST_ROUTE_MISMATCH` 或 `ACME_STATIC_FILE_FAILED` 对应 `[DIAG]` 和 `[STOP]` 末尾结果发回来；不要提供凭据或扫码登录 URL。

**备用路由仍是 `enabled:false`。** 即便 HTTPS 安装完成，也要分别验证手机移动网络上不同账号的授权、401/403 权限拒绝、真实 PDF Range 206 和连续阅读，才能考虑启用。安装过程不代表国内网络和 PDF 访问已经恢复。
