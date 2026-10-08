# Tencent instance screenshot PDF gateway feasibility, complete user-visible response

Beijing time: 2026-10-08T19:28:22.225+08:00
Current project: 抓取有机合成文献并持续更新网页
Task: User posted screenshot of existing Tencent Cloud Lighthouse monitoring; no request to change production.

## User-visible first fragment
## 腾讯云服务器资源核查结果

这张截图说明：**现有服务器具备部署轻量级 PDF 备用网关的资源基础，暂时没有必要购买新服务器。**

| 项目 | 当前状态 | 评估 |
|---|---|---|
| 月度流量 | 158 MB / 512 GB（0.03%） | 余量充足 |
| CPU | 2 核，当前使用 0.966% | 负载很低 |
| 内存 | 415 MB / 2 GB | 约 1.6 GB 余量 |
| 系统盘 | 7.3 GB / 40 GB | 约 32.7 GB 余量 |
| 操作系统 | Ubuntu Server 22.04 LTS | 适合部署轻量级网关 |
| 流量重置 | 2026-10-24 00:38 | 需要设置用量保护 |

**初步结论：优先复用这台服务器，不新增付费实例。**

不过，512 GB 是月度套餐额度，不是无限免费流量。必须确保新增的 PDF 请求不会造成超额计费；同时还要确认现有微信中继使用的端口、HTTPS 和进程配置，避免互相干扰。

## User-visible final fragment
另有两个核查要点。腾讯云控制台显示的“未设置域名”只是其控制台内的域名关联状态；此前公网 DNS 已确认 `relay.gczhouwld.com` 指向这台腾讯云主机，因此不必为此重新绑定或购买域名。截图没有直接显示实例地域，香港仅来自此前公开 IP 地理信息，还需以控制台为准。

腾讯云官方明确：轻量应用服务器的套餐流量只统计**公网出站流量**，超过月度配额会产生额外计费。(Tencent Cloud official billing documentation: https://cloud.tencent.com/document/product/1207/44368) 因此，真正上线备用网关前，会设置保守的流量上限，达到阈值就停止 PDF 备用传输，保留现有微信中继的流量空间；仅设置告警不足以确保零费用。

**下一步只差确认服务器内部的 80/443 端口归属，以及它连接 Cloudflare 的实际速度。** 我目前没有这台服务器的 SSH 会话，不能从公网截图判断端口是否可安全共用。请在腾讯云实例页面点击“登录／远程登录”进入网页终端，复制运行以下**只读检查**：

```bash
echo '=== 内存和磁盘 ==='
free -h
df -h /

echo '=== HTTP/HTTPS 监听端口 ==='
ss -ltn '( sport = :80 or sport = :443 )'

echo '=== Web 服务状态 ==='
for svc in nginx caddy apache2 docker; do
  printf '%s: ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo '=== 到 PDF 授权源站的匿名连通性 ==='
for u in   https://api.gczhouwld.com/api/_healthcheck   https://organic-synthesis-gallery.zhou526316.workers.dev/api/_healthcheck
do
  curl -sS -o /dev/null --connect-timeout 4 --max-time 10     -w 'HTTP:%{http_code} DNS:%{time_namelookup}s TCP:%{time_connect}s TLS:%{time_appconnect}s TTFB:%{time_starttransfer}s TOTAL:%{time_total}s\n' "$u"
done
```

这组命令不安装软件、不修改配置、也不读取 API Key 或 PDF。把结果发给我即可；IP 地址可以遮盖。我将据此判断是否能在**新增费用 0 元、不干扰公众号**的前提下，安全配置独立的 PDF 备用入口。当前仍未开始生产部署。

## Work completed
- Actual screenshot direct reading: 512GB included current package; 158MB used 0.03%, reset 2026-10-24 00:38:43; Ubuntu 22.04, 2CPU 0.966%, RAM 415MB/2GB, disk 7.3GB/40GB, public IPv4; console domain not configured does not mean DNS doesn't point at host.
- Compared main PROJECT_RULES.md and prior owner-private-pdf no-incremental-cost proposal.
- Main repo-only audit record added: audit/private-pdf/2026-10-08-tencent-instance-resource-screenshot-assessment.md commit 2b45f7f6007d3cbb7c18cee5673b38b05049ef82.
- Tencent Lighthouse official https://cloud.tencent.com/document/product/1207/44368 confirms only public outbound traffic metered and charged on overage. No assurance of free traffic once 512GB exhausted.
- No server access/SSH, no new instance/DNS/Proxy/Worker rights/service change, no added fees. Next only a read-only host port/service and uncredentialed cloud health check to plan gateway safely; deployment requires explicit final approval.
