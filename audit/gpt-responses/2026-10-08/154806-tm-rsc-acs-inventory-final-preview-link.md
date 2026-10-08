# Tampermonkey RSC/ACS/inventory approved repair — final test-channel delivery
Beijing: 2026-10-08 15:48:06 +08:00
Chat context: user approved narrow three-part publisher capture repair; direct HTTPS userscript install links requested, no sandbox download. Prior user explicitly forbids blind deployment.

## Repo and verification
- Source draft PR #414: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/414, head 7c80f1705180e3c98d0dcab2cce119750d0df5a1. Contains draft PR #412's prior approved scoped scheduler fix. Both remain DRAFT and unmerged.
- Changes limited to scoped Tampermonkey client RSC Silverchair DOI-bound source images (non-PDF preview), ACS TOC-first landing, browser/GM inventory concurrency/error attribution, and tests/workflows.
- GitHub 20/20 automatic PR workflows on exact source head SUCCESS (including targeted CI run 37744975432 and full Chromium queue fixture run 37744975383).
- Frozen CI-artifact test installer SHA256 f7804957003217d57c21f67d5387b593f6551b788de7812161bccd8cf1d228c1.
- Isolated preview branch preview/tm-rsc-acs-inventory-2270100-20261008, immutable installer commit c4c621c964bef56e23cebf78d5a0a7614a4eb756.
- Preview action 37745486734 SUCCESS. Validated source SHA 144a13491071cc34a0a449d77587830727d1a4e68b5c95c990555dbd117a0b1d. Metadata-only preview SHA256 10b955b48b077cff05e98e27f2d382963b8e86724b0348e7083a55a764aa1010, version 2.2.70.100, no @updateURL or @downloadURL.
- Direct raw URL successfully read back live: https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/c4c621c964bef56e23cebf78d5a0a7614a4eb756/public/gallery-vpn-bridge-2.2.70.100-preview.user.js ; UserScript header, version 2.2.70.100, RSC/ACS/inventory markers all present, no auto-update tags.
- Real publisher authorized browser acquisition and verified storage receipts still NOT tested (assistant cannot access user's local VPN browser); no basis to claim fully repaired, do not merge/deploy to main.
- No change to Publisher security access checks/cooling, no historical PDF/media records erased, unknown owner inventory never triggers PDF redownload.

## Earlier user-visible partial content
已找到 RSC 抓图失败的一个明确原因：出版社已将相关论文跳转到 Silverchair 新版页面，例如 `/gc/article/doi/...`，但当前抓取脚本仍主要按照旧的 `/en/content/articlehtml/...` 页面结构寻找 TOC 和正文图。

这解释了为什么页面能够加载文字，却反复出现 `rsc_other`、正文图 0 张的情况。RSC 在 2026 年已宣布将期刊迁移到 Silverchair 平台。

本次修复会以新版页面结构为依据，不会把 PDF 首页预览图误当作 TOC。ACS 和库存连接故障仍单独处理，避免三个问题互相影响。

## Midturn user-visible partial content
三个获批修复已提交到独立的 [PR #414](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/414)，专项回归测试已通过：

- **RSC**：支持 Silverchair 新版论文地址，提取与 DOI 匹配的 Visual Abstract、Figure 1，并保留一次期刊目录补抓机会。
- **ACS**：缺 TOC 的任务先访问 Landing 页面，正文专用任务仍使用 Full-text 路径。
- **库存**：限制同时进行的库存请求，明确区分浏览器超时、请求取消和 Tampermonkey 扩展传输失败。

现阶段这些修复只在隔离分支中。已有的 TOC、正文图及 PDF 不会被清空，出版社访问验证也不会被绕过。

**专项测试通过不代表真实抓取完成。** 正式发布仍需通过完整回归及授权浏览器的实际抓取验收。

## Final user-visible content
**全部 20 项自动回归测试已通过。** RSC、ACS 和库存读取三个修复已完成独立构建，但尚未经过你的校园 VPN 实际抓取验收。

**[点击直接安装 Tampermonkey 2.2.70.100 测试版](https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/c4c621c964bef56e23cebf78d5a0a7614a4eb756/public/gallery-vpn-bridge-2.2.70.100-preview.user.js)**

这是已在线验证的隔离测试链接，**不是正式版更新**。正式 PR [#414](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/414) 仍未合并。

请在 Edge 或 Chrome 的一个浏览器中安装，另一个保留原版作对照。安装时覆盖同名脚本即可，不要卸载或清空原有存储。刷新 Gallery，点击一次「立即开始任务（只补缺项）」，不要在出版社冷却期间反复启动。

运行后通过 Tampermonkey 菜单点击「上传本地 TOC 日志」，再回复“已上传”。我会根据**真实出版社访问和图片/PDF 存储回执**判断是否真正修复；没有成功抓取证据，不会发布正式版。
