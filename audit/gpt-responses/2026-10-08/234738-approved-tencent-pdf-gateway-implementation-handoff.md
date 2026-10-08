# Approved dual-ingress PDF gateway work — user-visible response synchronization

Beijing time: 2026-10-08T23:47:38.576+08:00
Project: 抓取有机合成文献并持续更新网页
Context: User explicitly approved adding isolated Tencent PDF ingress, DNS-only pdf host, nginx safe reload and Gallery automatic failover, under hard zero-incremental-cost constraints and preserve WeChat service.

## Partial visible progress already sent

PDF 备用网关的核心服务已完成第一轮开发，隔离安全测试 **9/9 通过**。

已验证的功能包括：原账号权限由 Cloudflare 后端判定、临时 PDF 地址映射、206 分段读取、安全 Cookie、未存储文件处理、跨域访问限制及月度流量上限。

**目前还没有部署到你的腾讯云服务器。** 下一阶段需要安装独立服务、配置 `pdf.gczhouwld.com` 的 HTTPS 入口，并通过实际网络验收，之后才能启用 Gallery 的自动切换。

---

前端自动切换功能已写入独立分支、默认关闭，独立测试模拟两条 Cloudflare 线路均失败时 Tencent 接管，验证 403 无法绕过。Nginx 安装脚本已设置 WeChat vhost 哈希检查、备份、失败回滚；Cloudflare DNS 只读核查：ZONE_READ http200，PDF_DNS_READ http403。试行 PowerShell AST 检查、Python9/9、Chromium33/33。


## Final user-visible completion/handoff

## 已完成的开发

本轮已经根据你的批准，在独立分支制作了 Tencent PDF 备用访问网关和 Gallery 自动切换代码：

- [PR #420](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420)：完整代码与安全审查入口。
- 网关后端：**9/9** 隔离安全测试通过，包含身份权限、签名地址转换、206 分段读取、安全 Cookie、越权拒绝、限额停止。
- Gallery 阅读器：**33/33** 浏览器回归通过，包括 Cloudflare 不可达时自动切到腾讯云、明确无权限时禁止绕过。最新登录兼容性修订仍在等待 CI 重跑。
- 网关仅监听腾讯云服务器内部的 `127.0.0.1:18867`，月度传输预算上限设为 **256 MiB**，不存储私人 PDF。
- 新线路默认 **disabled**，目前**没有更改你的腾讯云 Nginx、公众号中继、Cloudflare DNS 或正式网站路由**。

### 现在需要完成的两步

**1. 在现有 Cloudflare 控制台增加一条免费 DNS 记录。** 进入 `gczhouwld.com → DNS → Records → Add record`：

| 设置 | 值 |
|---|---|
| Type | `A` |
| Name | `pdf` |
| IPv4 address | `43.135.32.73` |
| Proxy status | **DNS only（灰色云朵）** |
| TTL | Auto |

**不要更改** `relay`、`gallery`、`api` 等现有记录。已检查现有 Cloudflare API Token：它可以读取 Zone，但 DNS 记录接口返回 **403**，因此我不能从这里替你自动添加，也不应要求你提供密钥。

**2. 用 Windows PowerShell 运行一键预检。** 无需管理员权限，但 SSH 登录需要你已有的服务器身份验证：

```powershell
$src = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/feature/owner-private-pdf-dual-ingress-20261008/deploy/pdf-gateway/run-from-windows.ps1'
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-run.ps1'
Invoke-WebRequest -Uri $src -OutFile $dst -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Preflight -SshUser ubuntu
```

预检通过、DNS 生效并且 TLS 工具已具备时，再使用**同一脚本**执行部署：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Install -SshUser ubuntu
```

安装前会要求输入 `YES`。脚本会备份现有微信站点配置，检查 `nginx -t`，安装新独立服务和免费证书（如果系统已有 certbot），并执行 HTTPS 健康检查。证书工具缺失、域名还未指向腾讯云、配置冲突或其他门禁不满足时，**停止，不强行部署**。

**当前不是已经上线成功。** 腾讯云 DNS+HTTPS 安装完成后，还必须验证中国境内网络的登录、PDF 第一/第二页、下载及原微信中继，然后才能将 Gallery 的备用线路开关打开。零新增费用是硬性约束；如果服务器接近月度流量额度，网关应停止使用，而不是触发超额计费。

## Technical evidence

- Branch feature/owner-private-pdf-dual-ingress-20261008, PR #420. Main remains unchanged except immutable audit response files.
- Gateway file deploy/pdf-gateway/gateway.py, installs localhost-bound Python service with no external dependencies; capped monthly egress, strict origin and URL allowlists, upstream Worker entitlement, signed URL rewriting and Range.
- Tests deploy/pdf-gateway/test_gateway.py: 9/9 passed, GitHub Actions run 37800545514; last installer CI including bash -n and PowerShell AST passed run 37803188862 (9/9 again).
- Browser tests tests/private-pdf-access-browser.mjs: 33/33 passed run 37802046303 (before additional legacy auth timeout-preservation patch, latest CI still queued). Disabled manifest means no traffic to Tencent until explicit acceptance.
- Cloudflare DNS read-only workflow run 37802719030: ZONE_READ http200, PDF_DNS_READ http403. **No DNS changes.**
- PowerShell downloads are pinned to 3f21b3791df8820114b71b292173a71f4afde57a source for install.sh/gateway.py, the launcher itself is on feature branch.
- Safety: no main merge, no paid resource, no on-server SSH session by assistant, no nginx or production changes. User must create a single DNS-only A record and run preflight/install using their own SSH, then accept domestic real-device tests. No 100% promise under disconnected/fully blocked networks or upstream global outage.
