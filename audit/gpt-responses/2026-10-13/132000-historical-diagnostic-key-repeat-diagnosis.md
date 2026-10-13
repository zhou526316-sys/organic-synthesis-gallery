# Historical text diagnostic token repeat-entry: read-only diagnosis
- Beijing time: 2026-10-13 13:20 Asia/Shanghai
- Chat context: 用户询问为何历史摘要／正文采集每次上传诊断都要重新输入密钥
- Repo: zhou526316-sys/organic-synthesis-gallery, main
- Change status: no production code or token modification; pending explicit approval before feedback fix
- Evidence: public/gallery-historical-text-pilot.user.js @version 0.2.3; lines ~215,437-438,495-553,655-657,735-740,799-812,1167-1171; docs/historical-text-search-pilot.md v0.2.2 user-authorized local GM token isolation
- Current code: GM_setValue(BATCH_DIAG_TOKEN, token); batchReportToken GM_getValue; configure click always clears ownerSecret.value and always labels same; sender timer 10 sec, not token delete
- Related separate TOC mainline: public/toc-mainline.user.js uses its own token keys; two scripts do not cross-read secrets
- Passwords/tokens/cookies deliberately excluded from this record

## Complete user-visible final answer

不应该每次都重新输入密钥。已经确认，这是 **0.2.3 历史正文诊断面板的交互设计问题**；但现有证据尚不能证明 Tampermonkey 真正丢失了此前保存的密钥。

我核对了当前 `main` 的 `public/gallery-historical-text-pilot.user.js`：

- 首次点击「配置诊断上报」并保存后，代码会把密钥写入该脚本独立的 Tampermonkey 本地存储（`GM_setValue`），正常刷新网页或更新同一个脚本不应要求重新输入。
- 保存之后，脚本在 Gallery 首页自动检查待发报告，约每 10 秒尝试发送；网络失败会保留待发记录以便重传。按设计，不需要反复点击「配置诊断上报」。
- **造成误解的具体问题**：按钮一直叫「配置诊断上报」，点击时无条件清空密码框（`ownerSecret.value=''`），旁边只有「保存并上传诊断」，没有独立的「使用已保存密钥立即上传」按钮，也不显示「密钥已配置」。因此即使密钥仍然存着，手动点击这个入口也会要求重新填写。
- 历史正文补抓是独立脚本，故意不读取原 TOC／VPN Bridge 脚本的密钥；Chrome 和 Edge、不同浏览器用户配置文件之间也不会自动共享。第一次在另一个脚本或浏览器配置时需要输入一次，但之后不应每次输入。

**目前可以直接这样判断：**在此前配置过的同一浏览器中打开 Gallery 首页，先不要点「配置诊断上报」，直接点击「服务器报告」。如果能读出记录，说明密钥已经保存，无需再输入；如果显示「请先配置」或「未配置密钥」，才说明该历史脚本当前读不到保存值；如果显示「上报密钥无效」，则是已存凭证未通过服务器验证，并非没有保存。不要把密钥发到聊天或截图里。

建议下一版把按钮改成「配置／更换密钥」，明确显示是否已配置；另设「立即上传待发诊断」，直接使用已保存的本机凭证，并保留自动重试、脚本隔离和管理员鉴权。这样才是一次配置、后续免重复输入。**本轮只完成代码核查，还没有修改或部署修复。**
