# Tampermonkey approved cooldown / PDF inventory correction — draft PR 412

Beijing time: 2026-10-08 14 (sekund: 52) +08:00.
Chat context: user approved the scoped Tampermonkey publisher cooldown, truthful visit counts, PDF inventory state and regression repair; earlier user rejected blind releases.

## Execution / result
- Draft pull request: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/412
- Branch: fix/tm-cooldown-pdf-truth-20261008
- Final candidate source head: 9a0ef49d49f85fe67c485046406130881a158f16
- Changed ONLY public/toc-mainline.user.js, tests/tm-immediate-restart.test.mjs, tests/tm-queue-coverage.test.mjs.
- No production Tampermonkey release/version bump, no Worker source or D1/R2 data modification, no old PDF/TOC receipt deletion, no cooldown force reset, no real publisher access conducted by assistant.
- Cooldown now preserves pending DOI and waits for safe expiry, other publishers proceed. Panel distinguishes no-open/deferred from actual opened publisher tabs, blocked-attempt, owner PDF lease absent/expired vs read failure.
- Github PR CI at 2026-10-08 14 (sekund: 52): 17/19 successful, 0 failures. Pending: Site quality gate and Tampermonkey controller recovery duplicate workflow. Recovery fixture has separately run and passed in queue-coverage workflow; site quality gate frontend build/API smoke/Worker dryrun passed and remaining browser step still running.
- GitHub Actions queue-regression run 37737620949 SUCCESS including Chromium fixtures and self-contained installer. Artifact 11532268269, file SHA256 original 381d2db10ee45b7e7a626a3ca1055e313af8175be48838c9f3ca22ee9c7433da.
- Isolated local preview packaged at /mnt/data/gallery-vpn-bridge-2.2.70.99-preview.user.js, SHA256 558e9be96795767f9c87a1653caf8f24795412602cf28f02f5e7bb91322f601a, same executable bytes as tested artifact; only metadata version/description, removed @updateURL/@downloadURL, no script-engine changes. Node syntax PASS.
- User must do real browser/VPN authorized capture and verify server media receipts before release; draft PR must remain open/unmerged, no production deploy.

## User-visible response body

### First partial reply

已完成第一阶段的代码修改，建立了独立的草稿 PR：

**[查看 Tampermonkey 最小修复 PR #412](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/412)**

这次只涉及调度、进度统计、PDF 库存提示和对应测试，没有修改出版社图片识别算法，也没有删除已有抓取记录。

目前仍保持 **2.2.70 正式版不变**。新修复留在独立分支中，等待回归测试和真实抓取验收。

### Second partial reply

第二阶段的关键回归已通过：包括 **23 篇冷却等待、0 次实际访问不误报完成**、冷却结束后继续派发、不同出版社互不阻塞，以及 PDF 库存未知状态的测试。

61 篇任务队列的 Chromium 模拟浏览器回归也已通过，并成功构建独立分支的安装包。

这些结果证明调度逻辑在测试环境中符合预期，但仍不等于已在你的校园 VPN 和出版社授权环境下抓取成功。

### Terminal reply

**独立测试安装包已准备好：** [Tampermonkey 2.2.70.99 测试版](sandbox:/mnt/data/gallery-vpn-bridge-2.2.70.99-preview.user.js)。

这是用于真实浏览器验收的候选版，不是已正式上线的新版本。它与通过回归测试的安装包具有相同的可执行代码；只修改了测试版标识并关闭自动更新。测试版本不会自行替换正式站点脚本。

截至本次检查，19 项 GitHub 工作流中 **17 项通过、0 项失败、2 项仍在运行或排队**。这两项尚未完成，所以正式发布继续保持暂停。

请在 Edge 或 Chrome 其中一个浏览器中试用，另一个浏览器保留原版作对照。先备份当前 Tampermonkey 脚本设置，再导入上面的 .user.js 覆盖**同名 VPN Bridge**（不要卸载、不要清空脚本存储）。刷新 Gallery，确认 Tampermonkey 中脚本版本为 **2.2.70.99**，点击一次「立即开始任务（只补缺项）」。

重点观察：是否明确显示「冷却等待」及截止时间；不受冷却影响的出版社是否正常打开；真正打开任务页之后「实际访问」才增加。如果全部任务都在冷却期，让 Gallery 控制页保持打开，等待正常解禁，不要连续反复点开始。

若 PDF 库存提示本浏览器未授权，请登录你的 owner 账号打开 https://gallery.gczhouwld.com/private-pdf-owner-setup.html ，按页面提示选择「授权本浏览器抓取 PDF（7 天）」。原有 PDF 不会因这次测试删除或重复下载。

首轮运行后，请通过 Tampermonkey 菜单「上传本地 TOC 日志」，并把实时进度面板截图发给我。不要发送密码、密钥或包含私密授权信息的浏览器备份。若需要恢复正式版，可以用 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 覆盖测试版，而不是卸载脚本。

只有真实授权环境能够打开出版社页面、获得可核验的 TOC/正文图或 PDF 回执，且剩余自动检查通过后，才考虑合并正式发布。
