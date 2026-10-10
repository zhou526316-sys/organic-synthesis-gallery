# 2026-10-11 00:42:39 Asia/Shanghai — Gallery 搜索速度及建议弹窗修复正式验收

对话上下文：本项目 Gallery LMCT 搜索修复后，用户反馈“搜索的速率太慢。而且有时候搜索的提示窗还会不消失，影响观感”，已明确批准实施两项优化。用户连接中断后多次“继续”，本轮承接并完成生产发布验收。

## 用户可见阶段性答复（本轮完整意思）

“搜索提速和弹窗的主要修复已经由 PR #506 和 PR #512 合并，包括减少输入时的重复渲染、取消过期查询、短期缓存，以及改进弹窗关闭和建议项点击行为。

针对中断后发现的最后一项问题——**文献卡片异步加载后，搜索提示未能及时重新出现**——我已从最新主线重新整合修复，提交为 PR #524。这次还补充了手机和桌面端的异步加载、Esc 关闭、点击外部关闭及关闭后不再意外弹出的测试。接下来核对 CI 和正式部署结果。”

“**PR #524 的浏览器回归已经全部通过。**
- WebKit：32 项 Hot/Archive 测试通过，其中包括手机和桌面端的弹窗关闭、异步候选恢复。
- Chromium：4 项专门的搜索建议测试通过，覆盖 390px 手机和 1280px 桌面布局。
- 前端构建、Worker 检查、生产 API 检查及质量总门禁也全部通过。
这说明新补丁已经通过测试环境的完整验证。下面继续合并并核对正式网站部署。”

“Worker 正式部署已成功，部署后的检查也全部通过。GitHub Pages 仍在执行媒体包校验，因此我暂时不把新弹窗逻辑标记为网页端已完成发布。”

“Pages 的 Hot/Archive 浏览器回归也已通过，包含此次新增的搜索提示测试。现在剩余的是网站统一发布流程中的账号同步、PDF 页面验收和正式资源部署。因此搜索逻辑和弹窗修复的代码与浏览器测试已全部过关；最终生产部署确认仍以 Pages 任务完成为准。”

“**正式网页部署已经成功。**
[Pages 部署及线上资源验收 #38067650301](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067650301) 的构建、部署、正式域名核验及搜索样式检查均为成功。
现在我再检查发布后的全库索引状态，避免前端更新后重新出现搜索结果不完整的问题。”

## 终端答复（与最终用户可见内容一致）

**搜索提速与提示窗修复已完成正式上线，并通过桌面和手机验收。**

- 输入响应：全库检索防抖由 220 ms 调为 135 ms，避免每个按键都重建 12/24 张文献卡片和触发媒体/PDF 加载；旧查询可以取消，30 秒短期缓存避免同一关键词反复联网。这些是代码行为，不等于对中国用户真实端到端耗时作出绝对保证。
- 提示窗：选择建议、Enter、Esc、点击外部、滚轮/触屏手势、失焦和销毁时能够关闭；文献卡片异步完成加载时，仅当用户仍聚焦并主动需要建议才会重新出现；关闭后不会被后台卡片刷新重新唤起。
- 测试：PR #524 的站点质量门禁全部成功；WebKit Hot/Archive 32 项通过，Chromium 搜索建议 4 项通过。生产 Worker 与 Pages 成功部署。
- **最新真实站点索引验收 #38068566150 全部成功：** 手机390px和桌面1280px连续测试 LMCT、ligand-to-metal charge transfer、配体到金属电荷转移、手性磷酸、轴手性均为 D1-index GET 且 HTTP200；LMCT 匹配 11 篇、两端均可见 11 篇；轴手性匹配25篇，手机首屏/页12篇、桌面24篇，没有隐藏卡片或 JS 错误。
- 站点 [https://gallery.gczhouwld.com/](https://gallery.gczhouwld.com/)；如果旧标签页仍缓存旧脚本，可按 Ctrl+Shift+R 强制刷新。历史库覆盖和实际国内网络速度仍独立评估，不夸大 938 篇正式目录为全部历史。
- 代码与测试 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/506 、https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/512 、https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/524
- PR #524 merge commit：e8fc94e869c15de2d333d5ce8eac727232f42857
- Site quality gate：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067284091
- Worker deploy：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067655287
- Pages deploy：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38067650301
- Final production all-time search acceptance：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38068566150

## 范围与实施细节
本轮从当前 main 创建 fix/search-suggestion-hydration-main-20261011，更新 src/user-ui/search-controller.ts、tests/architecture-frontend.spec.ts 和 .github/workflows/site-quality-gate.yml。
为解决搜索候选在异步媒体/Hot/Archive 卡片回填后未自动弹出的问题，新增 suggestionIntent；在 refresh() 建立候选后有条件地调用 renderSuggestions()；所有显式关闭动作取消该意图以避免孤儿弹窗。浏览器测试模拟先输入后填充候选，并验证关掉后不会复活；采用屏幕左上角的真实 pointer 外部点击避免覆盖层和自动滚动竞态。
PR #524 已 squash merge，无 DOI、正式文献、索引匹配、TOC、正文图、PDF、账号、发布时刻的修改。持续保留主站仅北京时间每日08:00正式新增规则。
Pages 发布初次 literature catalog shadow sync 曾因刚部署的静态 shard 临时 HTTP503 失败；随后的同代际重试成功，真实检索完整通过，不把短暂传播延迟误报为收录缺失。
