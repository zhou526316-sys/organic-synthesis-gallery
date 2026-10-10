# Project assistant response sync — approved owner Tencent-first PDF pilot

Beijing: 2026-10-10 approx. 19:19 Asia/Shanghai.
Chat: Organic Synthesis Gallery PDF full-library / Tencent-first routing. User approved: "先仅对管理员账号启用腾讯优先、Cloudflare备用，保留256 MiB预算和权限验证；通过真实阅读验收后再考虑扩大。"
Source PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/491
Main merged SHA: `7058e0994fc0c0116ed4ee043ea79de9ecf910d7`.
Production audit: `audit/pdf/2026-10-10-owner-tencent-first-production-rollout.md` committed as `5441b772eebff2c82df33b7b4a7e92367d817eec`.

## Partial visible answer already streamed

**管理员腾讯优先功能已完成开发，并通过 PDF 专项测试。**

PR #491：管理员腾讯优先、Cloudflare 自动备用
https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/491

专项验收 #38046623788 已成功完成，Chromium 浏览器回归 **59/59 通过**，包括管理员先走腾讯、普通账号继续走 Cloudflare、腾讯配额 429 自动回退、403 权限隔离，以及 PDF 第二页连续滚动。

腾讯网关的 **256 MiB/月配额保持不变**，全站腾讯自动路由仍然关闭。接下来还需要完成全站质量门禁、合并和实际生产部署，才能进入真实账号阅读验收。

## Subsequent partial visible answer already streamed

生产 Worker 部署已成功完成：[运行记录 #38046940325](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046940325)。

Pages 已进入构建队列。管理员腾讯优先的前端功能需要 Pages 发布完成才会在网页生效；Worker 部署成功本身不代表整个试点已经上线。

## Final visible answer

**管理员账号腾讯优先试点现已正式上线。** PR #491 已合并到 `main`（`7058e099`）。全站质量门禁、59/59 项 PDF 浏览器回归、[Worker 生产部署 #38046940325](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046940325) 和 [Pages 正式部署 #38046935614](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046935614) 都已通过。

我还独立读取了正式网站的 `https://gallery.gczhouwld.com/pdf-gateway-routing.json`，确认 `ownerPriorityPilot:true` 且 `enabled:false`；腾讯 `https://pdf.gczhouwld.com/_pdf_gateway_health` 也返回 `ok:true`。这证明试点配置与公网网关已生效，**不代表实际登录账号的完整 PDF 已经读通**。

现在有 `private_pdf_owner` 和 `private_pdf_read` 的管理员，使用普通 PDF 链接时会优先发起腾讯授权；腾讯网络超时、5xx 或 256 MiB 配额 429 时，自动以全新授权切回 Cloudflare。401/403 不绕过权限。普通 PDF 账号仍为 Cloudflare 优先，用户手动腾讯试读保留；下载仍默认 Cloudflare。PDF 画质、1 MiB 分段、连续上下滚动和每天唯一的 08:00 文献发布保持不变。

**最后需要真实阅读验收。** 请使用已登录管理员账号的浏览器，直接打开 [JACS 测试论文](https://gallery.gczhouwld.com/pdf/?doi=10.1021%2Fjacs.6c17448) 或 [Nature Communications 测试论文](https://gallery.gczhouwld.com/pdf/?doi=10.1038%2Fs41467-026-78405-z)。链接没有 `pdfIngress=tencent`，测试的是自动优先选择。只需确认第一页、第二页能正常显示且连续滚动；遇到错误发一张截图即可，无须 F12、复制密钥或逐篇检查全库。

此次 **管理员线路策略上线验收已通过，真实个人网络两页阅读尚未确认**。在你实际确认前，我不会把这次上线称为全库 PDF 可读，也不会扩大到普通账号。

完整审计：[管理员腾讯优先生产验收记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/pdf/2026-10-10-owner-tencent-first-production-rollout.md)。
