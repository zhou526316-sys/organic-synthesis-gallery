# Reply to user — link for approved Tampermonkey optimization

User asks: “那你优化好是否应该给我更新链接？”

Assistant response (Beijing 2026-10-17):
对。优化通过验收后，我应直接提供可以点击安装的 Tampermonkey 更新链接、明确的安装版本、更新内容及回退方法，而不仅是 PR 或 CI 链接。

目前，PR #739 的最新修订通过 27/27 组 CI，但尚未通过真实 owner 浏览器的出版社抓取提升验收；PR 仍是 draft、未合并、未部署。无法诚实地宣称“优化已可正式更新”。

已在仓库中确认的现有 Bridge 安装/自动更新地址（源文件打包器声明）：
https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js
当前打包器版本：Bridge 2.2.92，内置 TOC 脚本 6.2.73。该地址是现有正式渠道，并不包含 PR #739 新修复；当前未核验目标 URL 的 HTTP 返回状态。不要把它说成新的更新链接或强迫重复安装。

独立主线源码 @updateURL： https://gallery.gczhouwld.com/toc-mainline.user.js （现有 6.2.73，和集成 Bridge 不应重复安装）。

待实际浏览器验收过后，交付可安装的新版本及安装步骤，确认 @version 升级和已部署字节，保留旧版回退。仅浏览器测试候选可以单独生成明确标注的隔离测试链接，不等于生产升级。

Review: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/739
