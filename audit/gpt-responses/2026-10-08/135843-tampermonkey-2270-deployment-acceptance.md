# Tampermonkey 2.2.70 production delivery and postdeploy acceptance

Beijing time: 2026-10-08 13:58:43 +08:00. Project conversation: Tampermonkey continuation following connection timeout; user explicitly requested new working update link.

## Executed and verified

- Owner-private PDF inventory server route merged in #405 (21b7c094), serving read-only DOI states through existing owner capture-lease auth, no PDF objects or account identity exposed.
- Tampermonkey scope client merged in #407 (21a7db0259ff6755052a7568c3756ad960fe4d9e), VPN Bridge 2.2.70, install revision 6.2.51, capture protocol 6.2.20 and controller revision 2.2.41.
- Scope gate uses Gallery `addedDate >= 2026-10-01`, excludes historical/undated DOI from publisher dispatch while retaining full 887-paper registry for identity validation. Existing published media and private PDF objects untouched. New DOI still uses existing caption, quality, article PDF download, source binding and staging rules.
- Approved date/PDF-scoping focused regression passed; PR frontend Site quality gate run 37734297601 concluded success; Worker authoritative deployment 37734637574 concluded success.
- Postdeploy installer readback run 37734934803 concluded SUCCESS. Read-only report: API and Worker installers HTTP 200, bytes 408086 each, version 2.2.70, install 6.2.51, Oct-1 scope marker and owner PDF inventory marker present. Anonymous POST to private inventory denied. No publisher requests or production writes in the verifier.
- Direct fresh TinyFish read at this point confirmed `https://api.gczhouwld.com/gallery-vpn-bridge.user.js` and `https://organic-synthesis-gallery.zhou526316.workers.dev/gallery-vpn-bridge.user.js` both 2.2.70 / install 6.2.51. The canonical Gallery Pages installer URL still serves 2.2.68 because Pages workflow 37734637548 is IN PROGRESS. Do not incorrectly present Gallery URL as the new installer yet.

## User-facing final answer, following earlier partial messages

正式上线验收已通过：Worker 部署、网站质量检查，以及安装包线上回读均成功。API 和 Worker 两个安装端点均确认 2.2.70 / 6.2.51；未经授权读取私有 PDF 库存的请求也被拒绝。

**正式新版本更新链接：** https://api.gczhouwld.com/gallery-vpn-bridge.user.js

更新后刷新 Gallery，在 Tampermonkey 页面确认 VPN Bridge 2.2.70，点击「立即开始任务（只补缺项）」。新队列只会派发 Gallery 自 2026-10-01 起收录且确有待办的文献；今日文献优先。由于正文图片/PDF 的真实抓取仍依赖用户浏览器的出版社授权，不能将模拟回归成功等同于已将每篇缺图补完。

Gallery 站点同名安装链接在本次核验时尚未同步，仍为 2.2.68；应使用上述 API 链接安装。已抓取记录不会因升级而被清除。
