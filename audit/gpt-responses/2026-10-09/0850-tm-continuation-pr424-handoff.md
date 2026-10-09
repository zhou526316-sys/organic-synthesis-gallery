# Tampermonkey 接续审核记录
北京时间：2026-10-09 上午 08:50 前后
对话：继续tampermonkey工作，先完全承接记忆。再开始他未完成的工作
仓库：zhou526316-sys/organic-synthesis-gallery，main 唯一正式基线
关联 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/424

## 用户可见回答第一部分（内容同步）
已重新连接仓库，并读取 2026-10-09 08:24 上传日志对应的审计。
正式版：VPN Bridge 2.2.73 + TOC 6.2.54 + Controller 2.2.41。上一轮 Chem 修复 PR #424 尚未发布。
日志运行结束北京时间 01:50；当时 2026-10-01 起范围 177 篇，私人 PDF 174/177 确认保存（缺3、未知0），本轮16次实际出版社任务访问、18次尝试、尚缺15（其中 TOC 缺13）、本轮暂存正文图6、本轮完整补齐1。
今日 08:00 新增28篇，2026-10-01 起累计205篇，全站915篇；上一份日志尚未覆盖这28篇，因此不以15代替当前全量缺项。
限定：10月1日起的实际准入文献；只在真实缺口驱动的访问中顺带尝试 TOC/正文图/完整 HTML/PDF，已存 PDF 不重复取，不把 PDF 首页缩略图当 TOC，业主 PDF 不公开；08:00 唯一正式文献发布时刻不动。

## 衔接后继续验证的进展（本轮）
1. 重读 PROJECT_RULES.md、AGENTS.md、Tampermonkey 2026-10-09 审计、main 源码和 PR #424 全差异、专项检查。
2. PR #424 仍为 draft/open、没有并入 main；修复是：针对 Elsevier DOI→PII 验证后的路由回退，和确切绑定 Chem 网页在 DOI 校验失败后写最终“失败尝试”报告，释放控制器继续下一篇。没有伪称 TOC/PDF 缺失，也没有绕过权限。
3. 原始 PR head d4e06052fc81c167526313c3315301eacf97450b 的第一批 28 项 CI 检查全部通过；后因对分支做试验性版本联动后回滚，GitHub 重新派发了一组检查，截至最近一次查看仍有运行中检查，不能把新批次说成全部通过。
4. 检查出安装包版本联动约束：public/toc-mainline.user.js 的 @version/INSTALL_REVISION，cloudflare/scripts/build-bridge-loader.mjs loaderVersion，tests/tm-inventory-startup.test.mjs，scripts/verify-tm-oct1-installer-live.mjs 和 .github/workflows/tm-20261001-live-acceptance.yml 都需一致。
5. 曾只在 PR 分支内试写临时 2.2.74/6.2.55 版本和配套 startup test，后续验收规则编辑被安全限制拒绝。为避免部分改动形成不一致包，已经以 branch-head lease 原样回滚仅本轮 3 次试写提交；核对 head 回到原始 d4e06052fc81c167526313c3315301eacf97450b，@version/INSTALL_REVISION 恢复 6.2.54、正式 main 完全不受影响。原 Chem 修复及原测试未丢失。
6. 当前代码只处于 PR，不存在正式 2.2.74 可以给用户安装；原正式稳定链接 https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js，指向 2.2.73。不能谎称已升级、修复已上线或获得 owner VPN 浏览器验收。

## 原日志的具体剩余分类
- OL 10.1021/acs.orglett.6c03611：TOC 已存在，4/4 正文图已暂存，owner PDF 已保存，不重复抓。
- JOC 10.1021/acs.joc.6c01847：4/4 正文图暂存、owner PDF 已保存，官方 TOC 未确认。
- Green Chemistry/Chemical Science 多篇：Silverchair 为 PDF 预览缩略，不是图形摘要；需要只在已授权且可追溯 DOI+图号+页码的 PDF 原图救援入口提取候选并审核，不能绕过权限/自动公开。
- Chemical Science 10.1039/d6sc03717h 原 PDF HTTP403，不能伪称有 PDF。
- Chem 10.1016/j.chempr.2026.103220 与 .103282 之前出现 page_doi_unverified 与 controller_timeout，PII 分别 S245192942600286X 和 S2451929426003487，路由恢复还需真实 owner-VPN 验证。
- 当日新增28篇需新队列验收，不把旧运行代表今天的新文献。

## 下一步条件与工作边界
继续保留 PR #424 为 draft；由用户已安装的 2.2.73 对最新 205 篇范围做真实 owner-VPN 运行并上传自动诊断，再依据确切失败 DOI/层定向开发。新的正式安装包必须先通过全部协调版本检查、GitHub Actions、正式网页/API readback 和拥有合法权限的浏览器验收；绝不以测试脚本链接代替正式安装链接。
