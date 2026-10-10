# Architecture/PDF Tencent effective-nginx diagnosis and guarded repair

- Beijing time: 2026-10-10 11:28:47 +08:00
- Conversation: 腾讯 PDF 网关与手机跨账号网络验证（提交 -Mode Diagnose 结果）
- PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420
- CI: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38020555346
- Immutable launcher revision: e2b52071b9eb80b23170e896639a78e54c949b31
- Immutable installed source revision: 22bf1a51c85201b691d5bf07b6c28a7b458c1a02

## User-visible response (partial + final)

### 腾讯服务器诊断结果

这次诊断成功了，服务器没有出现 SSH、Nginx 进程或 80 端口异常。

| 检查项目 | 实际结果 | 判断 |
|---|---|---|
| Nginx 服务 | active | 正常 |
| Nginx 主进程 | PID 18637 | 正常 |
| IPv4 / IPv6 监听 | 0.0.0.0:80 / [::]:80 | 正常 |
| 微信中继站点 | osg-wechat-relay | 已加载 |
| PDF 网关站点 | 当前未加载 | 与之前回滚后的状态一致 |

**现在最值得怀疑的是 Nginx 的配置引入方式。**

原安装脚本默认把 PDF 站点链接放入 `/etc/nginx/sites-enabled/`。但如果服务器主配置只引入了指定的微信中继文件，而没有引入整个 `sites-enabled` 目录，那么即使 `nginx -t` 成功，新 PDF 站点也不会生效，请求仍会返回 404。

需要强调：这是与现有日志吻合的解释，还不能算最终确认，因为此次诊断发生在安装回滚之后。

我会按这个方向修正安装前的检查，而不是继续修改证书或 PDF 阅读器。

### 修复和验收

已在独立 PR #420 的 PDF 网关安装器中修复此前未验证 Nginx 主配置 include 关系的问题。当前脚本在 reload/Certbot 之前用 nginx -T 确认新 vhost 被生效配置加载；未加载时，只在主 nginx.conf **恰好包含一条明确的微信中继 include** 时，先保存仅 root 可访问的备份，再紧邻它新增一条带标记的独立 PDF include。未知/重复/不受支持的配置拒绝修改。改动不会修改 osg-wechat-relay 文件，失败或手工 rollback 时精确撤销新增行。Nginx reload 是整个 nginx 服务的平滑 reload，仍会发生，所以真实安装须通过 YES/扫码授权。

新增 Linux 隔离测试覆盖 HTTP 404→200→404、微信站点文件哈希不变；加上 Python 安全回归、Windows PowerShell 5.1 单 SSH 下载及语法验证，CI #38020555346 Linux/Windows 全部成功。

### 再执行一次正式网关安装（单次微信扫码）

在 Windows PowerShell 中粘贴以下四行（不要包裹花括号）：

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/e2b52071b9eb80b23170e896639a78e54c949b31/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-safe-include-install.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

脚本会要求输入 `YES`，再完成腾讯 SSH 的微信扫码。如果真实服务器的 nginx.conf 格式超出安全约束，会输出 `[STOP]` 并保留原站点；不要手动改配置或反复重试。

请发 `[CHECK]`、`[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]` 或 `[STOP]` 的尾部状态，勿发密码、临时扫码 URL 或 PDF token。

这一步是安装私有备用网关，不是启用 Gallery 的 PDF 回退；启用仍需合法账号访问、拒绝越权、Range 206、手机网络等真实验收。保留 `enabled:false`、现有 PDF 分段和画质、上下连续滚动，不增加付费资源。另一个手机账号的实际错误码仍未提供，不能据此判定权限或文件传输问题。
