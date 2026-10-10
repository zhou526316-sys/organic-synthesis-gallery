# Tampermonkey 授权冷却与库存超时修复：生产完成回执

时间：北京时间 2026-10-10 11:16:24
会话：抓取有机合成文献并持续更新网页 / Tampermonkey 接续 / 用户明确批准“批准”。
源码仓库：zhou526316-sys/organic-synthesis-gallery，main 唯一基线。

## 前序已对用户展示的结果（完整实质内容）

已按批准范围完成代码修改，并提交至 [PR #463](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/463)。

本次修复包括：

1. **按 DOI 冷却**：单篇文献出现访问验证时，不再直接让同出版社的全部文献等待 30 分钟。只有具备明确 HTTP 429 及 `Retry-After` 证据的出版社级限流，才允许影响其他 DOI。
2. **库存读取提速**：减少浏览器与 GM 请求双双超时后的重复等待；采用最多两个并行库存检查通道，同时保证失败或未知数据不会被误判为已补齐。
3. **冷却原因透明化**：记录触发 DOI、出版社、限制范围、原因和截止时间。

目标版本为 **VPN Bridge 2.2.79 / 引擎 6.2.60**，控制器保持 2.2.41。

ACS、缺项队列、PDF 安全及控制器恢复等核心回归已通过。代码当时仍在完成最终验收，旧的 2.2.78 尚不能视为修复。

## 实际完成的代码与合并证据

- PR #463: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/463 已合并。
- 合并提交：`f1c2054a43473b43fa93d24e2018eeee8b8555eb`。
- 代码头 `// @version 6.2.60`、Bridge build `2.2.79`；现有采集协议 `6.2.20`、控制器 `2.2.41`。
- 全出版社旧冷却无权威证据者失效；单篇访问门槛只设 DOI 冷却；只有 verified HTTP429 与 Retry-After 的真正出版社限流方可设置全域冷却。保留 CAPTCHA、401、403、授权及来源校验。
- 库存超时窗口 20s→16s，无效 native+GM 双超时不立即重演；两条库存读取通道并行，完整、未知、缓存保留区分。
- 相关主要 CI 在 PR 顶部最终功能提交通过：ACS recovery 38018887992；RSC ACS inventory 38018887953；Oct-1 scope & owner PDF guard 38018887904；missing-only 38018887911；immediate restart 38018887897；controller recovery 38018887987；private PDF v2 38018888010；acquisition 38018887962；TOC/PDF single visit 38018887951。
- 先前旧 Target journal CI 一处基线失败 `test-card20-policy-delta.mjs` 要求卡片10张，而历史 PR #454 已将其改成20张；独立旧基线，不是本次修复的功能失败。本次未越权调整媒体发布上限。

## 真实生产部署与线上读回

- Worker 正式部署工作流 `38019180194` 成功。
- GitHub Pages 正式部署工作流 `38019180217` 完成，授权、构建、正式 deploy 均成功。
- 先前只读脚本在 Pages 未部署时确实看到了旧版本，初次读回失败，未冒充通过。
- Pages 和 Worker 均部署后，只读在线验收工作流 `38019479786` 经 rerun，job `114118374959` 最终成功：
  - checkedAt `2026-10-10T03:15:22.376Z` (北京时间 11:15:22)。
  - `https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js`: HTTP200，458658字符/字节近似长度报告，@version 2.2.79，INSTALL_REVISION 6.2.60，首次读取成功。
  - `https://api.gczhouwld.com/gallery-vpn-bridge.user.js`: HTTP200，458658长度报告，同样版本，首次成功。
  - Oct-1+ 采集范围和 owner PDF 库存授权校验存在，匿名 PDF 库存请求遭拒；全部只读，`publisherRequests=0`、`productionWrites=0`。
- 以上是新安装包已经线上可访问的证据，**不是**新版本实际完成 DOI 抓取/图片/PDF 补齐的证明。尚待使用者安装后在真实有授权浏览器运行并上传日志确认。

## 交付给使用者的末次正文（与用户可见答复对应）

**线上部署和双域名版本验收已经完成。** PR #463 已合并，Worker 与 Pages 生产部署成功。北京时间 11:15:22 的真实读取验证表明：Gallery 与 API 两个安装入口均返回 HTTP 200，都是 VPN Bridge **2.2.79**、引擎 **6.2.60**，并保留私人 PDF 权限隔离；原 2.2.78 已不再是线上正式安装包。

正式更新地址：https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js

请在现有 Tampermonkey 中直接更新，不要卸载旧脚本或清空密钥、本地数据；更新后刷新 Gallery 页面，确认抓取面板显示 Bridge 2.2.79／引擎 6.2.60，再点击一次“立即开始任务（只补缺项）”。如果 Edge、Chrome 都参与采集，两边分别确认版本。

**仍需一次真实抓取验收**：这次上线已解决代码层面的连带冷却和库存失败重复等待，但不代表上次的 34 篇冷却以及 TOC、正文图、PDF 缺项已实际补齐。运行后请上传新日志，我将核对实际派发 DOI、逐篇冷却、库存耗时、存储回执和网站正式显示。
