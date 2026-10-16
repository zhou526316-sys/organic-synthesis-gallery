# Response synchronization — both Tampermonkey panels disappeared after update

- Beijing time: 2026-10-16 11:09:01 UTC+08:00
- Task: User says “更新完之后两个脚本的窗口都消失了”, following v0.2.11 historical fulltext update.
- Read-only source audit: `2bf18c47340276711b9463af4ce7f1cc73ffa4c4`, `audit/tampermonkey/2026-10-16-both-history-and-toc-panels-missing-readonly-diagnosis.md`.
- No repair implemented or production script changed, per `PROJECT_RULES.md` feedback approval rule.
- Evidence: `public/gallery-historical-text-pilot.user.js` v0.2.11 mounts `#osg-historical-batch`; `public/toc-mainline.user.js` v6.2.70 mounts `#osg-capture-live-panel`, independently; both public installers remain obtainable. Neither panel is fully removed by its own collapse button. Tampermonkey official Chinese FAQ `https://www.tampermonkey.net/faq.php?locale=zh&q=Q209` confirms Chrome-based browsers need Allow User Scripts toggle or Developer Mode. Browser tab listing did not expose an active Gallery tab; exact real-user extension state not verified.

## User-visible reply

**两个窗口同时消失，更值得先检查 Tampermonkey 的脚本执行权限。** 我核对了正式源码：TOC `6.2.70` 的右侧进度窗和历史正文 `0.2.11` 的左下角补抓窗都仍在，且是两套独立的页面注入逻辑。折叠也不会让整个窗口完全消失。**现在还不能确定是浏览器权限问题还是启动报错，窗口消失本身不代表本机正文被删除。**

请按顺序检查：

1. 在实际运行 Tampermonkey 的 Edge/Chrome 中打开 **https://gallery.gczhouwld.com/**（确保是这个主域名的首页），按 **Ctrl+Shift+R** 强制刷新。
2. 打开 `edge://extensions`（Chrome 使用 `chrome://extensions`），找到 Tampermonkey → **详细信息**，检查扩展已启用、允许访问 `gallery.gczhouwld.com`，并打开 **“允许用户脚本 / Allow User Scripts”**；如果 Edge 没有这个开关，检查扩展页面的**开发人员模式**。Tampermonkey 官方说明 Chrome 系浏览器需要相应权限，否则用户脚本无法注入。来源：https://www.tampermonkey.net/faq.php?locale=zh&q=Q209
3. 打开 Tampermonkey 管理面板，确认 **Organic Synthesis Gallery TOC Mainline** 和 **Gallery Historical Text Search — Local Pilot** 两个脚本都处于启用状态，然后再刷新 Gallery。

**不要卸载脚本、清除网站数据或重置 Tampermonkey**；这些操作可能影响本机正文、任务记录和诊断密钥。

如果刷新后仍然没有窗口，**请在 Gallery 页面点击 Tampermonkey 图标，告诉我它显示“本页正在运行的脚本”是 0 个还是 2 个**，或者发一张这个弹窗的截图（遮住私密信息）。若为 0，优先处理扩展注入/站点权限；若为 2 但页面没有窗口，再根据控制台错误排查挂载时序，不先盲目改抓取逻辑。
