# 2026-10-15 23:15:09 Asia/Shanghai — Tampermonkey PDF owner handshake release continued

Chat context: User provided a screenshot of the owner PDF setup page showing a Tampermonkey lease acknowledgment failure, requested that issue be fixed, then asked “继续” while PR #697 production deployment was in progress. This is the immutable response readback record.

## Earlier user-visible partial response
### Tampermonkey 2.2.87 deployment acceptance

PR #697 (https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/697) was merged after 27/27 CI jobs passed. Cloudflare Worker deployed successfully.

The first live readback, made while GitHub Pages was still deploying, showed API installer version 2.2.87 / 6.2.68 while the gallery canonical installer was still 2.2.86 / 6.2.67. The interim response correctly instructed the owner not to clear caches or install duplicate scripts.

## Final user-visible continuation
### 主域名也已完成新版部署

后续 Pages 发布已成功：[Pages #38755590688](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38755590688) 和 [Worker #38755590691](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38755590691) 均为 success。

已经直接读取两个正式安装地址，**两者现在均为 VPN Bridge 2.2.87、内嵌引擎 6.2.68**，并包含新版 PDF 授权握手。部署后的 [正式线上验收 #38758286733](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38758286733)、[安装包和队列验收 #38758286636](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38758286636)、[夜间只读验收 #38758286832](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38758286832) 均成功。两份实际文件都是 490,664 字节，且公开只读验收保留了私有 PDF 的匿名访问限制。

**正式更新入口：** https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 。备用：https://api.gczhouwld.com/gallery-vpn-bridge.user.js 。**仅更新已有脚本，不要安装两份。**

更新后刷新 https://gallery.gczhouwld.com/private-pdf-owner-setup.html ，点击“授权本浏览器抓取 PDF（7 天）”。新版会先探测 VPN Bridge 是否启动，再签发授权，并且只有本地写入和回读成功才显示“PDF 捕获授权成功”。如果失败，会具体提示扩展未在本页运行、授权格式错误或本地存储失败；不必重新绑定 owner，也不必清空 PDF 或 Tampermonkey 存储。

**验收边界：** 服务器部署和线上安装包验证已通过，尚不能替用户验证其本机 Tampermonkey 的实际授权成功。此前 6.2.67 的 190 项未执行缺项与连续心跳失败属于另一条抓取稳定性问题；本次 PDF 授权修复不代表这些 TOC、正文图或 PDF 已全部补齐。

## Evidence
- PR #697 merged as 0efcd2971e96e30fd0faa2b80b753a2b166d3a9b.
- Pages #38755590688: literature authorization, build, deployment all success.
- Worker #38755590691: deploy success.
- Live acceptance #38758286733: expectedVersion 2.2.87, expectedInstall 6.2.68, 2 installers HTTP 200, passed true, publisherRequests 0, mediaWrites 0; authenticatedUserBrowserVerified false.
- Installer readback #38758286636: both installer bytes=490664, queue 1151, latest 33, private inventory anonymous denial preserved.
- Night acceptance #38758286832: realUserBrowserOvernightVerified false, all static checks true.
- Separate direct public fetch on both custom domains verifies version and new lease probe; public owner page shows the updated Tampermonkey site-permission help.
- No media/PDF mutation, publisher-bypass, duplicated or evening publication, or browser credential exposure performed by the validation.

response_sync_status=committed; no secrets included.
