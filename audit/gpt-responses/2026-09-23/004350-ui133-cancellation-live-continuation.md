# UI / feedback continuation

Beijing time: 2026-09-23 00:43:50 +08:00
User request: 继续（连续两条）
Context: 接续吐槽与界面优化；关闭 PR133 请求生命周期缺陷的验证环节，不改抓图/文献发布链路。
Core implementation by this chat: 15198e4ad8b069e7715faa1954c5f7aea759affe.
Exact tested head was merged concurrently as d9e11e82b1e32289b2e968005ee124836d4ebf25 before this chat attempted a merge. No duplicate merge was performed.
This chat's proposed live-workflow replacement received HTTP409; preserved the concurrent 75377dd9bc70c5f7a47bb489887f211bb0bee976 workflow and reused its run 35755124915. The rejected write did not change the repository.
Evidence record: audit/ui-feedback/2026-09-23-004124-pr133-live-checkpoint.json, commit ac35604addbcf361a376a5fd5f38e8436ed3ede7.
Fresh feedback export: run 35754609698, generatedAt 2026-09-22T16:30:58.618Z. No feedback status writes by this chat.

## User-visible progress messages

继续处理 PR #133 剩下的报错，先核对最新代码和测试证据，区分真实故障与测试拦截问题，再推进上线验收。

PR #133 已补入“取消请求、刷新页面后是否误重试”的专项测试。我先检查这组证据，避免继续只调整跨域配置。

已复现关键原因：请求被取消或页面刷新时，旧请求仍尝试切换备用域名，并触发报错。接下来修复重试逻辑，保留正常断网回退。

修复已提交：取消和刷新不再被当成断网重试；真正的网络失败仍保留备用入口。我也同步读取新吐槽，不提前关闭尚未验收的条目。

原图与请求专项的 12 项测试已全部通过，包括此前失败的取消、刷新和桌面 GIF 检查。现在核对其余质量检查，随后验收公开页面。

PR #133 已合入最新 main，四项质量检查均通过。新吐槽仍是原来的 10 条，本轮没有关闭；接下来确认两处线上入口是否加载了修复版本。

线上结果已确认：Worker 的 10 项测试全部通过，此前的静态文件跨域和刷新后误重试报错未再出现。GitHub 入口通过了 8 项；剩下两项卡在新浏览器的预览状态标识，静态预览已经显示。我会把它与已修好的请求问题分开记录。

## Final reply

**PR #133 已上线，取消请求或刷新页面后“旧请求误重试”的问题，已在 GitHub Pages 和 Worker 两个入口通过专项复测。** 本轮修复提交为 `15198e4`，合并版本为 `d9e11e8`。fileciteturn243file0L2-L2

这次解决了两个问题：文献数据、中文标题、图片索引等静态文件不再被误转到 API 域名；请求已取消或页面正在刷新时，不再启动旧请求的备用域名重试。正常网络故障的回退仍保留。fileciteturn243file0L2-L2

### 实际验收结果

合并前，原图、路由和请求生命周期专项 **12 项全部通过**，其余三项 PR 检查也通过。公开页面复测结果如下。fileciteturn243file0L2-L2

| 入口 | 本轮结果 |
|---|---|
| **Worker** | **10/10 全部通过**，包括手机与桌面 GIF 播放、原图校验、刷新保留、图片查看及取消/刷新请求测试。 |
| **GitHub Pages** | **8/10 通过**；取消、刷新和原图校验已通过，剩余两项卡在新浏览器的预览状态标识。 |
| Cloudflare Pages 备用站 | 测试端仍返回 `ENOTFOUND`，未能验收；这不能直接推断为所有用户均无法访问。 |

GitHub 剩余两项**不是原图或 GIF 字节校验失败**：进入新浏览器上下文后，页面已经包含 PNG 预览图，但“当前显示预览”的内部标识未在测试等待时间内更新。它与本轮已修好的请求重试问题分开处理；第 28 条暂未整体关闭。fileciteturn243file0L2-L2

**#29 摘要窗口放大（仍保持非全屏）、#30 可选环绕光效，本批尚未实现。** 后续先修正预览状态标识，再处理摘要窗口。阅读人数偏少也仍需独立核查：本轮修的是请求处理，不是人数计数规则，没有写入测试阅读人数。fileciteturn243file0L2-L2

[查看本轮修复前后测试、线上记录与截图](sandbox:/mnt/data/ui133-release-evidence.zip)
