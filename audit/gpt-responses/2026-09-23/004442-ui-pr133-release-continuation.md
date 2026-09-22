# UI / feedback continuation — PR133 release

- Beijing time: 2026-09-23T00:44:42+08:00.
- User request: 继续.
- Context: 接续吐槽和界面优化；修复 PR133 的静态请求域名与导航取消重试问题，保留第28条未完全验收状态。
- Diagnostic test head: 33da89ee55cd47f0e8f0c68cc459877f25a6e5c7.
- Tested fixed head: 15198e4ad8b069e7715faa1954c5f7aea759affe. Equivalent source fix was a concurrent write; this session reread after HTTP409 and preserved it rather than overwriting.
- Merge: d9e11e82b1e32289b2e968005ee124836d4ebf25.
- Live workflow: 75377dd9bc70c5f7a47bb489887f211bb0bee976, run 35755124915.
- Evidence record: audit/ui-feedback/2026-09-23-004249-pr133-live-release.json, commit ed05aa826f1f751d27e786fc8f7424de355049fb.
- Scope: no production literature data, publication slots, capture/Bridge source, backend counting semantics or feedback statuses changed. No production test reader events.

## User-visible progress messages

本轮接着处理 PR #133 的最后一项失败，先核对最新代码和请求日志，区分测试问题与线上故障，再推进合并和验收。

上一轮的桌面端图片操作已通过，最后报错的是阅读人数请求。我正在检查页面刷新时的取消、重试顺序，避免继续盲改跨域配置。fileciteturn201file0L2-L2

已补上三种定向测试：请求提前取消、请求途中取消、页面刷新时仍有请求未完成。它们会记录具体重试顺序，并阻止测试请求写入生产数据。

代码级复现发现：请求取消后，仍会进入备用域名重试；页面退出后的失败也没有单独处理。我会修正这一区分，同时保留正常断网回退。fileciteturn211file0L2-L2

时间线确认了失败原因：刷新取消主请求后，程序立即向备用域名重试，随后才触发页面离开事件，并产生跨域报错。修复会在导航开始时停止这类重试，而不是屏蔽错误。

同一修复已进入 PR #133 的最新版本，我保留了并发提交，没有重复覆盖。它不会弹出离开页面确认，也不会主动中断已发出的阅读记录请求；现在复测原图和旧界面功能。fileciteturn219file0L2-L2

复测已通过全部 12 项：三种取消/刷新测试，以及手机、桌面的原图和 GIF 测试都通过，页面报错也消失了。接下来核对正式门禁，再验收线上版本。

PR #133 已合并，正式质量门禁全部通过。本轮接着检查部署后的两个主要入口，确认修复不仅在测试环境中生效。

GitHub Pages 和 Worker 的部署都已成功；线上测试已启动，仍会单独保留备用站的失败结果。这次不改变阅读人数的去重规则，只修复请求处理错误。

Worker 线上测试已全部通过，原先反复出现的刷新后跨域报错未再出现。GitHub 入口仍在测试；备用站本次仍未通过可用性检查。

线上结果已收齐：Worker 的 10 项全部通过；GitHub 通过 8 项，剩下两项是新浏览器中的预览状态等待超时，预览图片已经显示。本轮的取消、刷新和重试检查均通过；第 28 条仍保留未关闭。

## Final user-facing response

**PR #133 已合并并上线，提交为 `d9e11e8`。本轮解决了反复阻塞验收的“页面刷新后错误重试”问题，Worker 入口已通过全部线上测试；GitHub 入口仍有两项预览状态检查未通过。**fileciteturn247file0L2-L2

### 本轮修好了什么

**静态文件不再误走 API 域名。** 文献数据、中文标题和图片索引等文件保持原请求地址，只有真正的 `/api` 请求才使用备用接口。fileciteturn238file0L8-L8

**刷新或取消请求后，不再错误重试。** 时间线证实，旧代码把页面刷新导致的请求取消当成“服务器故障”，立即向备用域名重试，进而产生跨域报错。现在已区分取消与断网，保留正常断网回退；没有屏蔽错误检查，也没有添加离开页面确认弹窗。fileciteturn238file0L8-L8

### 实际验收结果

合并前的 **12 项专项测试全部通过**，正式质量门禁也全部通过。部署后的独立实测结果如下：fileciteturn247file0L2-L2

| 入口 | 本轮线上结果 |
|---|---|
| Worker | **10/10 通过**，包括手机、桌面的 GIF 播放、原图校验、刷新恢复、图片查看及页面错误检查。 |
| GitHub Pages | **8/10 通过**；两项失败均发生在新浏览器的预览状态等待环节。 |
| Cloudflare Pages 备用站 | 检测端仍返回域名解析错误 `ENOTFOUND`，未执行浏览器测试；不能据此认定所有用户都无法访问。 |

**GitHub 的遗留不是“GIF 不播放”或“图片没显示”。** 原图、动画、刷新恢复和查看窗口的检查已通过；失败时静态预览图也已存在，但程序没有在测试时限内完成“当前显示预览图”的状态标记。这部分仍需修复，因此第 28 条没有关闭。fileciteturn247file0L2-L2

本轮没有改变阅读人数的统计与去重规则，不能算作“人数偏少”问题已解决；**#29 摘要窗口放大、#30 可选光效仍未实施**，抓图链路和文献数据均未改动。fileciteturn247file0L2-L2

[查看本轮修复前后测试、线上验收记录与截图](sandbox:/mnt/data/pr133-ui-release-evidence.zip)
