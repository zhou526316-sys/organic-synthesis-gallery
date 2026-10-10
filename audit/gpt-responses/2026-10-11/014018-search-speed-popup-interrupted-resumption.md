# Organic Synthesis Gallery — 搜索提速与提示弹窗修复：中断后接续、生产核查与过期 PR 结案

北京时间：2026-10-11 01:40:18（Asia/Shanghai）
对话上下文：用户批准修复「搜索太慢、建议弹窗不消失」，连续要求「继续」「连接中断请继续」。本轮承接中断前分支并核对其他项目工作线的最新生产合并状态。

## 已展示的分段答复

连接中断前的修复已经由其他工作线继续推进。我核对了最新仓库，确认**搜索提速和建议弹窗修复已合并**，包括：

- [PR #506](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/506)：减少输入时的重复渲染，支持取消过期检索和短时缓存。
- [PR #512](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/512)、[#517](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/517)、[#521](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/521)、[#524](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/524)：逐步修复建议弹窗的关闭、重新打开和异步候选更新问题。

最新正式站点搜索验收已通过。不过，还有一项针对 Safari/WebKit 弹窗回归的测试调整尚未合并。我会先核查它的状态，避免把中断前的旧分支再次覆盖到最新代码上。

另外本轮向用户说明：「核对完成：最新 Pages 部署成功，包含弹窗关闭和异步候选恢复的 WebKit 回归测试也已通过。未合并的 PR #514 基于旧版交互逻辑，现与更新后的测试冲突，已经不适合直接合并。我会保留当前已上线的修复，清理这条过时的测试 PR，避免旧逻辑再次进入主线。」

## 最终答复正文（将随本记录发送）

剩余工作已核查完成。PR #514 是较早的测试调整，已经与主线中新版弹窗行为及回归测试冲突，因此我已添加说明并关闭这条过期 PR；**没有回滚任何已上线功能，也没有将旧分支覆盖回 main**。

正式站点已包含搜索提速：输入防抖从 220 毫秒降至 135 毫秒；全库搜索等待时不再每按一个键就重建 12/24 张卡片及媒体内容；过期请求可取消，相同的已验证查询结果短时缓存 30 秒。建议弹窗也加入了外部点击、Enter/Esc、滚轮及触屏手势关闭、选择后关闭，并处理了失焦重进、中文输入法和异步候选更新时的残留问题。

**验收已通过：** 最新正式 Pages 部署 [#38068981239](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068981239) 成功，包含 Hot/Archive/WebKit 搜索交互回归；桌面 Chromium 和 Safari/WebKit 界面刷新成本测试 [#38068513302](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068513302) 均通过；最新全库搜索实站验收 [#38070039963](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38070039963) 的两种视口、五组连续关键词均成功，LMCT 可见 11 篇、轴手性全库匹配 25 篇，没有网络请求错误和隐藏卡片。

你现在可以在 [Gallery 正式网站](https://gallery.gczhouwld.com/) 使用 Ctrl + Shift + R 强制刷新后试用。上述验收证明代码与生产浏览器检查通过，但 **不能由 GitHub 测试环境的耗时推断你的国内实际网速**；目前没有你本机端到端耗时数据，不应宣称达到了某个确定秒数。

## 事实与审计

- `main` 于本轮开始为 `c62ce16b1f003bcd4be881ab34eac28ea8518817`，以该主线而非旧分支 `fix/search-fast-popover-lifecycle-20261010` 为权威基线。
- main `src/main.ts`、`src/platform-api.ts`、`src/literature-catalog-view.ts` 和中断分支的 corresponding blob SHA 一致；主线 `src/user-ui/search-controller.ts` 是新版本（blob SHA `e8184dee122d203a17019d2ed64aa982e5cdb122`），包含后续 PR 的 `suggestionIntent`、失焦取消、wheel/touchmove 人为滚动识别与异步候选恢复。
- main `tests/architecture-frontend.spec.ts` 已覆盖 390/1280 两布局，提示弹窗选择、外部点击、Enter/Escape、滚动、触屏、键盘、语言重挂载、异步候选恢复、快速输入不重复重建卡片、取消旧请求与短期查询缓存。
- PR #514 基于旧 scroll 触发关闭的测试逻辑，`mergeable_state=dirty`，已通过评论 [#6100349409](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/514#issuecomment-6100349409) 解释为何被新版主线覆盖并以 `state=closed, merged=false` 结案。
- Site quality gate [#38068513341](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068513341) 通过。UI refresh cost [#38068513302](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068513302) Chromium 4/4 和 WebKit 4/4 通过。Pages [#38068981239](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068981239) build/deploy 全部成功，线上目录与搜索 CSS 校验成功，build 内 32 项 Hot/Archive 浏览器测试通过。
- [#38070039963](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38070039963) 的真实生产浏览器两布局通过 5/5 搜索请求，LMCT=11、轴手性=25，全部 GET、无隐藏卡片、无 JS 错误。由同一日志无法推出用户本地网络性能。
- 此轮未对生产源代码进行重复提交、没有更改正式 DOI/媒体/PDF、没有改变每日唯一北京时间 08:00 文献发布槽，只关闭了已被新主线取代的测试 PR #514 并写入此答复记录。
