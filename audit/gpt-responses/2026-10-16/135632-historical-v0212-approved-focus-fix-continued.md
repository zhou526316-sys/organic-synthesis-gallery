# GPT response synchronization — continued approved Gallery panel focus fix

- Beijing 2026-10-16 13:56:32 (+08:00)
- User context: “可以” approved preventing automatic publisher foreground takeover; “继续” requested completing the work.
- Audit source: `077dc39d247f0fe3da3048121adcc6d1f94ec8f9`
- Existing concurrent implementation: PR #717, merge `9234e494d67a336b7ea2826cdcf29eee6a53a869`
- Read-only verification; no duplicate repair or production settings change.

## Complete user-visible reply

## 历史正文 0.2.12：已完成自动抓取防抢焦点修复

核对最新 `main` 后，发现你批准的修复已经由另一条并行工作线完成并合并，本轮不需要再重复修改。

新版的行为已经调整为：

- **普通全库补抓**：始终在后台打开出版社页面，不自动切换当前标签页。
- **出版社脚本无回执**：记录失败原因，不再自行打开前台重试页面。
- **单篇前台重试**：新增「单篇前台重试（手动）」按钮，只有你确认具体 DOI 和切换提示后才会激活出版社标签页。

相应的 Chromium 回归也加入了双面板保留检查，验证自动补抓期间 Gallery 的 TOC 和历史正文窗口不会被脚本的前台切换行为影响。

这解决的是此前确认的**自动抢占浏览器前台**问题。它不等同于已经解决所有正文获取失败，我接着核对正式部署和实际抓取回执。

## 0.2.12 已正式上线

已确认 [PR #717](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/717) 合并至 `main`，提交为 [`9234e494`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/9234e494d67a336b7ea2826cdcf29eee6a53a869)。

[Pages 部署 #38846683323](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846683323) 的授权、构建和部署全部成功。构建日志确认：

`HISTORICAL_TEXT_INSTALLER_ARTIFACT_VERIFIED 0.2.12`

另外，[历史正文专项回归 #38846212782](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846212782) 已通过43项单元测试及 Chromium 浏览器验收。正式主域名返回的脚本也已包含新的手动前台重试按钮和防抢焦点逻辑。

**正式更新链接：**

[安装／更新历史正文 Tampermonkey 0.2.12](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)

API 备用域名尚未确认同步到0.2.12，因此仍以主域名为准。

## 最新诊断：仍需真实浏览器确认

我重新执行了[管理员只读诊断 #38834544404](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38834544404)。最近200条记录中，**尚无 0.2.12 的抓取回执**，记录仍来自0.2.8、0.2.9和0.2.10。

因此，当前可以确认自动抢占前台的代码已修复、浏览器回归已通过，但还不能确认新版在你实际使用的 Edge/Chrome 中取得了多少篇正文。

## 现在如何验收

请通过上方主安装链接更新实际用于抓取的 Edge/Chrome 的 Tampermonkey 至 `0.2.12`，只启用一份历史正文脚本，再刷新 Gallery 首页。先检查左右两套控制面板正常显示，点击「出版社回执核验（最多8篇）」做一次简短对照：常规任务应保持 Gallery 为当前标签页，不会再自动激活出版社页面。

如果手动使用「单篇前台重试（手动）」，它会明确显示 DOI 和切换提醒；只有确认才允许切换前台。

验收后点击「立即上传待发诊断」以获得真实 0.2.12 结果；该8篇仅是诊断样本，非正式全库抓取上限。本次沒有清除本机正文、修改既有许可边界或公共全文检索，也不影响 TOC、正文图、PDF、SI 和每日北京时间08:00发布。

[本轮只读上线及诊断报告](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-16-v0212-foreground-no-focus-postdeploy-and-real-browser-gate.md)

**目前状态：修复已经合并并上线；真实浏览器效果仍待 0.2.12 回执确认。**
