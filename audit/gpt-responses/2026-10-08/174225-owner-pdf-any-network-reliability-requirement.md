# 跨网络 owner-only 私有 PDF 可访问性：本聊天回复同步

北京时间 2026-10-08T17:42:25.328+08:00
项目聊天 “抓取有机合成文献并持续更新网页”；用户新要求：“不管什么网络环境，只要是我的账户，都要能看啊”。

## 实际发送的第一段回复

你的要求应当成为 Gallery 私有 PDF 系统的正式验收标准：

**只要是你的账号、登录有效、PDF 已经存入私人文献库，无论使用校园网、家庭宽带还是手机网络，都应当能够正常阅读。** 不应该要求你切换 VPN、修改 Clash 或下载到特定电脑才能使用。

此前的 36 篇 PDF 测试虽然全部通过，但没有满足这项标准。

我已确认当前架构存在两个问题：

1. `api.gczhouwld.com` 和备用的 `workers.dev` 实际依赖同一套 Cloudflare Worker、D1 和 R2。它们不是独立的网络交付线路。
2. `gallery.gczhouwld.com` 目前没有可用的同源 `/api` 入口。因此，即使网页加载正常，PDF 授权请求仍需要额外连接 Cloudflare API。

**下一步应该改造授权和文件交付线路，而不是继续把授权超时从 15 秒改成 30 秒。**

## 最终接续回复

进一步核对发现，Gallery 用于判断你的 PDF 权限的 `/auth/session` 请求，也只走 `api.gczhouwld.com`。所以**仅增加 PDF 下载备用地址仍然不够**：必须同时让账号登录、权限确认、PDF 授权和文件传输都具备可用的备用通道。

我建议采用 **Cloudflare 主线路 + 腾讯云独立 PDF 网关**。浏览器正常情况下继续使用现有接口；主线连接超时则自动切换到新的 `pdf.gczhouwld.com`。备用网关在服务器端安全地转发授权及 PDF 分段请求，不能签完票据又让浏览器跳回访问失败的 Cloudflare 域名。两条线路继续验证同一账户的 `private_pdf_read` 权限，普通账户不能读取你的私有文件。

你之前已有一台腾讯云 Ubuntu 服务器，正在为 `relay.gczhouwld.com` 承担微信中继。我会**先只读检查**其地域、负载、HTTPS 配置和对 Cloudflare 的连通性；不重启、不重装、不修改现有微信中继。如果能安全隔离，优先复用以避免新增费用。如果不适合，再评估独立香港实例，并在购买前单独确认价格与每月 **¥50** 的预算。腾讯云曾公布香港 Linux 入门配置约 **¥38/月**，实际价格需要以当前下单页面为准。（来源：腾讯云 2025-09-15 香港轻量服务器刊例调价公告 https://cloud.tencent.com/announce/detail/2131）

上线验收不能再依靠美国 CI 通过：必须从中国境内不同运营商测试同一已授权账号的登录、PDF 第一页与翻页、整份下载、自动切换，并覆盖现有 16 种期刊。对于尚未抓取的 14 篇新文献，要继续补抓，不能把“没有文件”当成网络故障。

我已把改造边界、账号安全、验收与回滚要求写入 [跨网络阅读架构方案](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-owner-cross-network-delivery-proposal.md)。**当前仅完成核查和方案，没有擅自改动生产服务。**

**是否批准按这个方案实施？** 我会先核实并优先复用现有资源；若需要新增付费服务器、改动微信中继或私有 PDF 存储，会另行取得你的许可。对完全断网的设备，云端实时读取客观上不可行，需要事先保存加密离线副本。

## 核实证据

- main: src/private-pdf-reader.mjs 使用 api.gczhouwld.com + workers.dev 双入口，共用一套 Cloudflare Worker/D1/R2，3.5s hedge，15s deadline。
- main: src/private-pdf-access.ts 的会话/capability 刷新仅使用 api.gczhouwld.com；需要覆盖 owner 登录、会话、open 和 file 四部分，不只换下载 URL。
- 匿名外部 GET gallery.gczhouwld.com/api/_healthcheck 返回 404，现有 Gallery 自身没有可用 /api 路由。
- 旧失败实际 15.0s authorize / both-failed，未进入文件下载；36 份真实 PDF 在 GitHub Actions Chromium US 外部测试成功，无法证明国内最后一公里。
- 既有腾讯云 Ubuntu 实例的原用途：relay.gczhouwld.com 微信 JS-SDK、access_token、jsapi_ticket、公众号发布中继；用户以前对实例管理明确要求只读，不破坏现有服务。地域、性能与反代入口待核实。
- 腾讯官网说明大陆节点 EdgeOne 需要 ICP；Enterprise 中国大陆网络优化非低成本默认选项。参考 https://edgeone.ai/zh/document/63620 与 https://intl.cloud.tencent.com/zh/document/product/1145/56448；香港 Lighthouse 旧官方刊例约38元/月，实际价待确认。
- 已在 main 创建待批准方案文档：audit/private-pdf/2026-10-08-owner-cross-network-delivery-proposal.md，commit 2865103412c7393b8763d2851c1491ce5460100e。
- 未部署任何网关、未更改 DNS/Worker/PDF 权限/微信中继/发布规则。
- 具体部署前等待用户对独立 Tencent 网关架构的特定批准；新增花费和碰触现有 relay 另需明确授权。
