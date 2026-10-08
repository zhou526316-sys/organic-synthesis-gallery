# Organic Synthesis Gallery Tampermonkey Bridge 2.2.71 — final release verified

Beijing time: 2026-10-08 16:15:25 +08:00
Context: user requested direct final update rather than repeated testing builds; follow-up “继续” approved continued release work.

## Actual release verification
- PR #415 merged (squash): 619475c8bbf001d568053b1a4e2d5b787ee2b9cc.
- Final release-branch commit d36d1ca0ac008384e8db50746aa3790dd9df64bd: **21/21** pull-request workflow runs concluded success, zero failed; including scope/pdf inventory, controller, publisher acquisition, Chromium queue, RSC/ACS targeted CI.
- Cloudflare Worker production deploy 37747506382 success.
- GitHub Pages deploy 37747506389: literature authorization success, build success, deploy success; no forced schedule change.
- Official Worker postdeployment installer readback 37747788943 success; includes unauthenticated owner-PDF inventory protection.
- Direct read-only published URL checks from https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js and https://api.gczhouwld.com/gallery-vpn-bridge.user.js each show version 2.2.71 and new RSC Silverchair/cooldown/inventory functions.
- Direct read-only https://gallery.gczhouwld.com/toc-mainline.user.js shows 6.2.52.
- Never assert authenticated end-user publisher media captured or 23/23 gaps closed based solely on CI and HTTP script verification.
- An earlier partial user-facing message with official API download link was separately synchronized to audit/gpt-responses/2026-10-08/161040-tm271-canonical-worker-production-link-and-pages-pending.md. This current record covers terminal final answer.

## User-visible final reply
**正式版 VPN Bridge 2.2.71 已完整上线，主站和 API 均已验证。**

**[点击直接安装／更新正式版 2.2.71](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js)**

此次修复包含 RSC Silverchair 新页面识别、ACS TOC 文章入口优化、出版社冷却调度和 PDF 库存读取改进。

已确认 **21/21 项发布回归通过**，Cloudflare Worker 和 GitHub Pages 均部署成功；主站和 API 安装包均返回 **2.2.71**，TOC 主线为 **6.2.52**。在 Tampermonkey 中覆盖同名 VPN Bridge 即可，不要卸载或清除已有数据。

**说明：** 已完成的是正式发布及链路验证；出版社真实访问权限、个别论文图源以及所有缺项是否补齐，仍以实际抓取回执为准。
