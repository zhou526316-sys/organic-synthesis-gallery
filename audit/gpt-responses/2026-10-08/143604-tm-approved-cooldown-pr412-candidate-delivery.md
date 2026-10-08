# Tampermonkey approved scheduler truth and local acceptance candidate

Beijing time: 2026-10-08 14:36:04 +08:00.
Context: user approved narrow Tampermonkey publisher cooldown, visit accounting, owner PDF inventory labeling, and targeted tests; explicitly avoid blind deployment.

## Verified work

- Only PR #412 (draft, unmerged): https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/412
- Branch: fix/tm-cooldown-pdf-truth-20261008, head SHA 9a0ef49d49f85fe67c485046406130881a158f16.
- Changed files: public/toc-mainline.user.js, tests/tm-immediate-restart.test.mjs, tests/tm-queue-coverage.test.mjs; no other production source, owner documents or user data changed.
- Fix: preserve pending obligations under publisher-wide 30-minute access cooldown and safely resume after expiry, continue unaffected publishers, distinguish opened publisher tab vs pre-opening attempt, prevent 0/23 false completed message. PDF state explains owner authorization missing/expired vs read failure. Actual 401/403/429 restrictions are not bypassed.
- Verified offline tests: 23 deferred and 0 visits, 23 eventual retry when due, unaffected publisher processed, pre-open failure not counted as visited, PDF auth-state exact handling. 61 jobs in Chromium fixture (mocked publisher network, 0 production writes) with 60 resolved, 1 intentionally unresolved.
- GitHub CI as of time: 18 of 19 PR workflows success, 0 failures; dedicated Tampermonkey controller recovery regression still running. Controller recovery test already passed within other successful regression workflow. This is not full green and not actual publisher capture acceptance.
- Runner artifact 11532268269 from successful https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37737620949.
- Isolated user-distributable candidate: /mnt/data/gallery-vpn-bridge-2.2.70.99-preview.user.js, SHA256 558e9be96795767f9c87a1653caf8f24795412602cf28f02f5e7bb91322f601a, bytes 416664. Compared to CI-tested packaged Bridge, executable payload is byte-identical. Only Userscript metadata changed (2.2.70.99 preview, description, remove auto update/download URL), node --check PASS. Local sandbox file verified in this turn.
- Do not merge, publish or present an official upgrade until remaining CI and user-authorized desktop publisher capture/storage readback are satisfied. Production remains 2.2.70.

## User-visible final reply text

**隔离测试安装包已准备好：** [Tampermonkey 2.2.70.99 测试版](sandbox:/mnt/data/gallery-vpn-bridge-2.2.70.99-preview.user.js)。

这是给真实浏览器验收使用的候选版，**不是正式上线的新版本**。它与通过回归测试的安装包具有相同的可执行代码；仅修改测试版标识，并关闭自动更新。现有正式安装地址仍保持 2.2.70。

截至本次核查，19 项自动工作流已有 **18 项通过、0 项失败，最后 1 项控制器恢复工作流仍在执行**。因此现在仍不合并 PR #412。

请先选择 Edge 或 Chrome 中的一个浏览器测试，另一个继续保留原版。备份当前 Tampermonkey 脚本与设置后，下载上方 `.user.js`，在 Tampermonkey 中导入并**覆盖同名 VPN Bridge**；不要卸载脚本或清空存储。刷新 Gallery，在 Tampermonkey 中确认版本 **2.2.70.99**，只点击一次「立即开始任务（只补缺项）」。

重点观察面板的「实际访问」「冷却等待」和「PDF 核对」。如仍处于出版社冷却时间内，保持 Gallery 控制页打开，等待安全恢复，勿反复启动。如果提示本浏览器缺少 PDF owner 授权，可以在登录后打开 https://gallery.gczhouwld.com/private-pdf-owner-setup.html ，根据页面提示点击「授权本浏览器抓取 PDF（7 天）」；不能将“未知”当成 PDF 缺失。

测试结束后，通过 Tampermonkey 菜单「上传本地 TOC 日志」，并发我一张运行后的进度面板截图。不要发送密码或 API Key。若需恢复当前正式脚本，可通过 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js 手动覆盖测试版，保持已抓取的数据与授权记录。

**正式发布仍需两个条件**：所有必要自动检查通过，以及你授权浏览器中确实打开论文页面、取得并核验 TOC/正文图或 PDF 存储回执。达不到就继续保留草稿 PR，不盲目上线。
