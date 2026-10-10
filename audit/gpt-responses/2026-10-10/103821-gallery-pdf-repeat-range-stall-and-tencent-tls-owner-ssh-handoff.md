# Organic Synthesis Gallery PDF repeat transfer timeout and standalone Tencent route blocker

Beijing time: 2026-10-10 10:38:21
User latest screenshot: PDF.js viewer parse-stage pdf_transfer_timeout after 24.6s, 1581ms authorization, 494ms PDF.js init, 3 Range calls, primary authorization route. Screenshot does not establish successful alternative file route.
Project policy: no small Range chunk-size changes; user explicitly declined these, as they could compromise scrolling fluidity.
Read-only public verification: GitHub Actions #37891507915 rerun 2026-10-10T02:36:28.629Z, job 114111168080, DNS PDF and relay both A 43.135.32.73, PDF HTTPS ERR_TLS_CERT_ALTNAME_INVALID; presented CN and SAN relay.gczhouwld.com only. Active Tencent routing flag=false on Draft PR #420; no independent ingress yet.
Private user credentials and PDF content: never read. No project production code changes performed this turn. User must approve SSH from own Windows PC to install independent gateway.
Audit: audit/pdf-reader/2026-10-10-campus-edge-privpdf-second-failure-tencent-tls-obstruction.json.

## Previously sent partial user-visible answer

这张截图确认：**PDF 授权已经恢复正常，但文件传输问题仍然存在。**

| 阶段 | 本次结果 |
|---|---|
| 授权 | 1.581 秒 |
| 阅读组件 | 0.494 秒 |
| 文件读取与解析 | 超时 |
| 总耗时 | 24.6 秒 |
| 分段请求 | 3 次 |
| 错误 | `pdf_transfer_timeout` |

这不是权限不足，也不是因为 PDF 连续滚动功能本身失效。问题集中在取得授权后，从 Cloudflare 文件接口读取 PDF 数据的环节。

我进一步核对了正式版：传输失败时虽然有备用线路机制，但**只有成功切换后才会显示切换次数**。这次截图没有该记录，不能证明备用线路已经成功接管。现有的主备地址也都依赖 Cloudflare，无法抵御两条线路同时不通的情况。

## Final user-visible continuation

**已重新确认当前真正的基础设施阻塞：腾讯云独立 PDF 网关尚未安装成功。** 今早重新进行的只读检查显示，`pdf.gczhouwld.com` 已解析到现有腾讯云服务器 `43.135.32.73`，但服务器返回的 HTTPS 证书仍只适用于 `relay.gczhouwld.com`，因此报 `ERR_TLS_CERT_ALTNAME_INVALID`。[查看今日核验](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37891507915)。

当前不能通过忽略证书错误来强行启用；而且两个 Cloudflare 地址同时传输不畅时，增加重试次数也无法解决。**我不会修改你明确要求保留的 PDF 分段大小、画质或连续滚动方式。**

真正需要推进的是**现有腾讯云服务器的独立 PDF 入口**。此前已准备了只使用现有服务器、免费 HTTPS 证书、单次 SSH 登录、带回滚保护的安装脚本。它需要你本人完成一次微信扫码 SSH 认证，当前聊天没有这项登录能力。请在 Windows PowerShell 中运行：

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/cae30a94be56747f7405ee25783261accedc9f36/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-one-ssh.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Install
```

脚本先要求输入 `YES`，再进行 SSH 微信扫码，并在安装后从你的 Windows 网络检查可信 HTTPS、公开健康接口和未授权 PDF 请求是否被拒绝。它不会直接开放全部私有 PDF，也不会自动合并尚未验收的腾讯路由。

运行后只需告诉我末尾的 `[SUCCESS]`、`[WINDOWS HTTPS PASS]`、`[WINDOWS SECURITY PASS]` 或 `[FAIL]`／`[STOP]` 状态，**不要发送密码、Cookie 或含 `token=` 的 PDF 链接**。我再验证真实 PDF 的授权、206 分段读取和 Edge 访问，通过后才考虑正式启用。你不用再反复切换学校 VPN 与 Ghelper。

目前这次新截图对应的在线 PDF 故障**尚未解决**；在腾讯线路验收前，已有本地副本可先使用“本地 PDF”阅读。
