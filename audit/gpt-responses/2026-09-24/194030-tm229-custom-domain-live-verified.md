# GPT response sync

Beijing time: 2026-09-24 19:40:30
Context: Tampermonkey custom-domain migration and live verification
Related commits: 8e7837412bc3d81ad060e9f5bb966f636e716ec6, d404a9da9e354effc597a6462d96547d0404de26

已接上并完成收尾。现在不是“等待部署”状态，而是 **2.2.29 已正式上线并通过新域名实测**。

- PR #217 已合并，正式修复提交为 `8e7837412bc3d81ad060e9f5bb966f636e716ec6`；对应 GitHub Pages 部署成功。
- 两套当前 live verifier 都直接从 `https://gallery.gczhouwld.com/` 读取线上文件并通过。最终 HTTP 检查时间为北京时间 2026-09-24 19:40:30：`gallery-vpn-bridge.user.js`、`toc-demand-live.json`、Worker capability、`media-index.json` 均返回 200；线上 Bridge = **2.2.29**，capture protocol = **6.2.20**，当前队列 566 篇。
- 旧的 `Verify Tampermonkey 2.2.20 live` 确实只是过期检查器导致的假红灯。我已用 PR #219 修正并合并，提交 `d404a9da9e354effc597a6462d96547d0404de26`；新的 **Tampermonkey 2.2.29 final HTTP check 已 success**。
- 我刚才重复开的 #218 已关闭，避免和已经生效的 #217 形成第二条冲突修复线。

你现在直接打开安装地址：`https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js`。**不要先卸载旧 2.2.27**，直接让 Tampermonkey“更新/替换”为 2.2.29，这样原有脚本存储和令牌更稳妥。

更新后刷新 `https://gallery.gczhouwld.com/`。正常情况下 Tampermonkey 不应再显示“没有运行中的脚本”，并应重新出现“查看实时抓取进度 / 设置或更换 Gallery Bridge 写入密钥 / 立即运行媒体抓取队列”等菜单；随后 2.2.28 已加入的“单篇失败就跳过、继续下一篇”行为仍然保留。

如果更新到 **2.2.29** 后新域名页面仍显示“没有运行中的脚本”，那时根因就不再是代码或部署，而要继续查浏览器/Tampermonkey 对 `gallery.gczhouwld.com` 的站点访问权限。
