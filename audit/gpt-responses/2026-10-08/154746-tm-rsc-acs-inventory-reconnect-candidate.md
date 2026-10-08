# Tampermonkey recovery after message disconnect — approved RSC, ACS and inventory patch

Beijing time: 2026-10-08 15:47:46 +08:00.
User context: “连接已中断” during already approved limited Tampermonkey publisher/inventory repair.
Action: review existing branch PR #414, CI and verified direct installer. No production release or manual publisher access.

- Draft PR #414: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/414
- Candidate head: 7c80f1705180e3c98d0dcab2cce119750d0df5a1
- Dependent earlier draft PR #412 head: 9a0ef49d49f85fe67c485046406130881a158f16
- 20/20 GitHub workflow checks at PR head successful; real authenticated publisher capture not verified.
- Online preview immutable commit: c4c621c964bef56e23cebf78d5a0a7614a4eb756, version 2.2.70.100, no automatic update/download URL metadata.
- Online raw content read successfully in this turn; contains Silverchair route, ACS TOC landing, bounded inventory diagnostic and prior cooldown handling.
- Actual publisher pages may still be gated or lack correct live visual assets; do not assert user-side successful capture without latest real receipts.

## Exact user-facing answer

已从中断处继续，并核对了独立修复分支。**三项已批准的修复已提交至草稿 PR #414，20/20 项自动化检查通过，尚未合并或上线正式版。**

本批修改针对：
- **RSC**：识别 Silverchair 新版 `/{期刊}/article/doi/...` 页面，只在 DOI 匹配且存在真实图片时提取 Graphical Abstract 或 Figure 1；不把 PDF 首页预览图充作 TOC。
- **ACS**：缺失 TOC 的任务优先使用 `/doi/{DOI}` 文章入口，不再因为顺带抓正文图就强制跳入 `/doi/full/`；访问验证及冷却保护保留。
- **库存**：最多两组并发核查，区分浏览器请求超时、扩展请求失败和取消，云端 PDF “未知”仍不能当作缺失。

**[点击直接安装 Tampermonkey 2.2.70.100 测试版](https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/c4c621c964bef56e23cebf78d5a0a7614a4eb756/public/gallery-vpn-bridge-2.2.70.100-preview.user.js)**

这是已核实能够打开的在线安装链接，自动更新已关闭。建议只在 Edge 或 Chrome 的一个浏览器中覆盖现有同名 VPN Bridge 进行验证，另一浏览器保留旧版作对照；不要卸载脚本、清除数据或反复点击启动。

**重要：20/20 通过属于自动化和模拟浏览器验收，不是你校园 VPN 中真实抓取成功的证据。** 请安装后在 Gallery 点击一次「立即开始任务（只补缺项）」，观察 ACS/RSC 是否实际进入论文并获得 TOC/正文图保存回执，然后用 Tampermonkey 菜单「上传本地 TOC 日志」，回复“已上传”。我会核对真实结果，符合要求后再考虑合并正式版。
