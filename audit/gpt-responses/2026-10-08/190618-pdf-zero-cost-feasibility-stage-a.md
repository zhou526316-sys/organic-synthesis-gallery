# Gallery PDF zero-cost ingress feasibility response log

Beijing time: 2026-10-08T19:06:18.121+08:00
Chat context: user replied “好” to proceed with read-only zero-incremental-cost PDF access feasibility assessment.
No new purchases, no DNS changes, no Cloudflare API mutations, no existing Tencent relay modifications, no real-user sessions, no PDF permissions changes.

## User-facing preliminary updates
- Initial plan: read-only Cloudflare/Gallery domain and Tencent WeChat relay feasibility, no paid resources or production writes.
- Intermediate: Cloudflare custom Worker routes are feasible when hostname DNS is proxied, but this alone is not independent ingress; existing Tencent region/remaining bandwidth unknown.
- Progress: Tencent Lighthouse overage generally bills by traffic and requires verifying its package & usage before enabling any PDF gateway.

## Checked facts
- DNS authoritative NS Cloudflare; gallery CNAME to GitHub Pages; api resolved to Cloudflare edge; relay A to Tencent 43.135.32.73 (public ASN/geolocation HK; actual console region unverified); pdf candidate hostname has no public A record.
- Cloudflare routes docs https://developers.cloudflare.com/workers/configuration/routing/routes/
- Cloudflare custom domains docs https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Tencent traffic overage official https://cloud.tencent.cn/document/product/1207/44368
- Cloudflare limits docs https://developers.cloudflare.com/workers/platform/limits/ and R2 pricing https://developers.cloudflare.com/r2/pricing/
- No Tencent Cloud management connector/signed-in console available to read personal quota and usage.
- Technical record https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-zero-incremental-cost-ingress-readonly.md, commit 7a7a073212a6fa718fe554f895aba34273da5232.
- User original hard constraint: zero incremental paid usage, not merely no new instance. Proposed Tencent DNS-only ingress is blocked on account-specific server quota and access verification. We must not assert real cross-country success from DNS checks.

## Full final reply
已完成第一阶段的**零新增费用、只读可行性核查**。

公网 DNS 证实：`gczhouwld.com` 使用 Cloudflare DNS；Gallery 主站仍指向 GitHub Pages，而 PDF API 经过 Cloudflare。现有 `relay.gczhouwld.com` 指向腾讯云地址，公开地理信息显示香港；拟作为独立入口的 `pdf.gczhouwld.com` 目前尚未配置。这样可以研究在**现有腾讯云机器上增加 DNS-only 独立 PDF 网关**，无需新购服务器，但尚未验证其实际可承载能力。

**现在的关键阻碍是零费用保证。** 腾讯云轻量服务器部分套餐超过月度流量额度后，会按超额流量计费。仅凭“已有服务器”不能确认增加 PDF 传输后仍为 0 元；需要先核实套餐类型、剩余流量、CPU/内存余量以及现有中继是否能安全隔离。（腾讯云官方计费说明：https://cloud.tencent.cn/document/product/1207/44368）

已将 DNS 核实、架构候选、安全边界和费用停止条件保存到 [只读可行性报告](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-zero-incremental-cost-ingress-readonly.md)。本轮没有改 DNS、服务器、Worker、微信中继或 PDF 权限，也没有产生任何新增订阅。

**请发一张腾讯云控制台中这台轻量应用服务器的「实例配置／套餐流量使用」截图**，能看到地域、套餐类型、每月总流量和已用流量即可；账号、实例 ID 和公网 IP 可以遮住。拿到这些信息，才能判断如何在不增加费用、不影响公众号的条件下继续。
