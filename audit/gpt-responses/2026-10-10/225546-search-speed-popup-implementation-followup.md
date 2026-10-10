# 2026-10-10 22:55:46 Asia/Shanghai — 已批准的搜索提速与建议弹窗修复续作

用户消息：“继续”。属于同一工作线明确批准的 Gallery 搜索速度和建议提示浮层修复。

## 本轮向用户发送过的主要内容

- “我继续完成已批准的修复。搜索提速和弹窗关闭逻辑已写入修复分支；接下来重点补齐回归测试，检查快速输入、旧请求取消、建议选择后关闭，以及手机端触屏行为，避免优化速度时重新造成摘要检索漏篇。”
- “已经提交修复 PR：[**#510：搜索提速与提示窗关闭修复**](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/510)。本次改动包括：减少输入期间的重复卡片与媒体渲染，将搜索防抖从 220 毫秒调整为 135 毫秒，取消过期查询，为相同检索增加 30 秒短时缓存，并修复建议弹窗在点击、触屏选择及键盘操作后的关闭逻辑。同时增加了手机、桌面端测试，确保加速时不会让旧查询覆盖新结果，也不会重新引入摘要匹配文献被隐藏的问题。”
- “核查合并历史时发现，另一条工作线已经将同一批搜索提速与弹窗修复作为 [PR #506](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/506) 合并到 main。我不会再把重复的 #510 强行合并，避免覆盖已上线的改动。我现在改为核对 #506 的测试和部署结果，并单独检查是否还存在触屏点击后弹窗残留的边界问题。”
- “补充核查发现：搜索提速的主要改动实际上已由并行工作线通过 [PR #506](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/506) 合并。为避免重复合并和覆盖代码，我已关闭此前的 #510。但 #506 的一轮 Pages 发布被两项建议弹窗的 WebKit 测试拦住：一项涉及 Esc 键，另一项涉及触屏选择时过早移除选项。接下来会只修复这些边界问题和测试，再以新的 Pages 部署作为上线依据。”
- “已经把剩余修复缩小为 [PR #512](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/512)：不再触碰已合并的搜索核心，只修复触屏、鼠标、键盘选择建议时的事件顺序，并消除两项 WebKit 测试的竞态。目前前端、Worker、桌面与移动浏览器回归都在 CI 中执行；通过后再合并，不会绕过质量门禁。”
- “**搜索刷新性能回归已通过：** Chromium 和 WebKit 两套浏览器测试均成功，没有发现本次事件修复增加重复刷新或额外状态读写。[查看性能验收 #38060812830](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38060812830)。完整网站交互回归仍在运行；生产发布还未完成。”
- “PR #512 的前端构建、类型检查、Worker 检查和生产 API 检查均已通过；正在执行完整 Playwright 回归。另外确认，较早的 Pages 发布确实因为建议弹窗测试失败而被拦截。新 PR 正是针对该阻塞项，不会改动搜索索引或已收录的文献。”
- “**PR #512 已通过完整质量门禁并合并。** [完整质量验收 #38060812767](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38060812767) 中，前端构建、Worker、生产 API、账户与媒体交互以及 Hot/Archive 浏览器测试全部成功。这意味着已批准的搜索提速改动和提示窗关闭修复都已进入 main。接下来核对正式 Pages 部署，确认用户实际访问的网站已加载新版本。”
- “正式部署已进入媒体与文献基线完整性检查阶段。搜索修复代码本身已经通过质量门禁；这些发布检查用于保证新前端上线时不会覆盖已有 TOC、正文图和文献目录。当前没有发现搜索相关的新失败，接下来核查 Pages 构建和正式访问结果。”
- “代码和回归测试已经全部通过，但正式 Pages 发布仍在既有的 TOC／正文图包合并验证阶段。这一步属于网站统一发布门禁，并非搜索代码报错。我不会跳过这项检查强制覆盖线上文件；部署成功后才能认定搜索速度和提示窗修复已对普通用户生效。”

## 完成本轮的代码与变更

- 发现 main 已通过 [PR #506](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/506) 合并相同搜索提速：避免逐按键重建、135ms 防抖、AbortController、30s/32键验证结果缓存、前端 DOM 查验。
- 本轮创建的重复 [PR #510](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/510) 已明确关闭且**未合并**，避免覆盖 main。
- #506 原 Pages [#38056938267](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38056938267) 的 WebKit 验收 2 项失败：Escape 的原生 search 类型行为，以及 pointerdown 立刻移除 popup target 造成 click 竞态。
- 本轮在最新 main 基线上提交并合并 [PR #512](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/512)，合并提交 `d35b4cee7cb6073ab365061e9d5210b7b7b853ef`。选项的 pointerdown 只阻止失焦、在 click 阶段选择；支持鼠标、触屏和键盘，滚动建议容器本身不误关。测试隔离 2 字符静态搜索异步重挂载，改用真实输入变化，新增 mouse/touch/keyboard 和弹窗退出回归。
- [Site quality gate #38060812767](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38060812767)：所有必要 jobs success，包括 Playwright 完整交互、类型检查、Worker dry-run、production API smoke。
- [UI refresh cost regression #38060812830](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38060812830)：Chromium 与 WebKit both success。
- main read-back 确认搜索取消与性能探针、click 选择和30秒缓存存在。
- 2026-10-10 约 22:55:46 北京时间：正式 [Pages 部署 #38061184943](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38061184943) 与 [Worker 部署 #38061193865](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38061193865) 均为 in_progress。Pages 在 TOC/body packet 完整性校验阶段；不能宣称线上已部署。同步 Worker 工作流 #38061184939 当时报告 cancelled，但独立 Worker 生产部署仍在执行。需按最终正式网站实际部署与浏览器核查来确认普通用户生效。
- 未修改正文图、TOC、历史文献入库、正式 DOI、摘要索引、PDF 安全协议、08:00 发布槽或媒体权限。

## 待提交的终端回复正文

已完成并合并搜索提速和提示窗关闭修复。PR #506 包含快速检索的主要改动，PR #512 解决 WebKit 弹窗触屏/点击边界；重复的 #510 已关闭。搜索的每次输入不再完整重建卡片，防抖降到 135ms，旧查询会取消，近期相同已验证查询复用 30 秒缓存。提示窗统一在 click 阶段选择，支持鼠标、触屏、Enter、Escape、点击外部及滚动关闭。

质量门禁、桌面/移动浏览器交互、前端编译、API 和 WebKit/Chromium 刷新成本检查都通过。相关链接：PR #506 / #512、CI #38060812767 / #38060812830。

但最新核查时正式 Pages #38061184943 和 Worker #38061193865 尚在执行发布检查，**目前不能声称新版本已在正式域名全面生效**。用户可打开部署链接查看当前状态；仅当显示 success 后刷新 https://gallery.gczhouwld.com/（必要时 Ctrl+Shift+R）复验。已按项目规则记录当前事实，未绕过正常安全发布和 08:00 新文献槽。
