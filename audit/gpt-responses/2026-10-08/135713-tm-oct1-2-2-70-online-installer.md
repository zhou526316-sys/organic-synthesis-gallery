# Tampermonkey Oct-1 scope repair — user-visible status and installer

Beijing time: 2026-10-08 13:57:13 +08:00. Chat context: continuation after messaging timeout, requested new update link.

The staged backend owner-only read-only PDF inventory was merged in PR #405, commit 21b7c094; client scope repair merged in PR #407, commit 21a7db0259ff6755052a7568c3756ad960fe4d9e.

19 scoped regression workflows on PR head 4b7048d8ee33a6ee83fd3df673fbf136a3e2fabc passed, with a generic Site quality WebKit interaction regression still running at merge. Worker frontend and Pages deployment workflows for the merge started; exact byte validation from live site is ongoing.

A read-only live fetch at time of this record verified:
- https://api.gczhouwld.com/gallery-vpn-bridge.user.js — @version 2.2.70, INSTALL_REVISION 6.2.51, Oct-1 cutoff marker present, and owner PDF inventory endpoint present.
- https://organic-synthesis-gallery.zhou526316.workers.dev/gallery-vpn-bridge.user.js — same 2.2.70/6.2.51.
- https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js — still older 2.2.68 during Pages media snapshot rebuild. Do not send the gallery URL as the new update link until synced.

## User-visible answer

新版已在正式 API 域名核验为 **VPN Bridge 2.2.70 / 安装版 6.2.51**，并包含 2026-10-01 起的新增文献范围限制与站长云端 PDF 库存核对。

**更新链接：** https://api.gczhouwld.com/gallery-vpn-bridge.user.js

请使用上述 API 入口更新 Tampermonkey；截至本次核验，Gallery 站点的同名链接仍在同步中，暂时还是旧版 2.2.68。已有 PDF、正文图、TOC 和历史记录不会因为这次脚本更新而删除。装好后可在脚本信息中确认版本 2.2.70，并刷新 Gallery 页面重新生成本轮缺项队列。

后续继续核对 Gallery 页面同名脚本和正式部署结果，不能将未通过的实时抓取表现描述为已全面恢复。
