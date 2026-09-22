# UI / feedback continuation — final response

Beijing time: 2026-09-22T23:55:01+08:00.
User request: 继续.
Context: Continue UI/feedback mainline, deploy feedback 28A and perform actual public-frontend acceptance. No capture-chain or literature-publication work.

Related changes:
- PR131 merge 004779910a2ff384dd0224201bb48a8d61442a48.
- PR132 merge 0067a4930c855f481f7f10fa971227d9e04e93d8, reviewed head abfa3ad29050ca7dc898cc4447377556412f04dc.
- Corrected live test adapter 7d06f4c08356b83d5e072d41419623faefd7674a.
- Latest open-feedback export trigger 10f25dc9e4e5c09df2dba9e883ae65acb0b209a9.
- Evidence record a5598a3260f0054c151c1f8536655e669048d49b at audit/ui-feedback/2026-09-22-235330-feedback28-release.json.

GitHub deploy 35749611103 and Worker deploy 35749622943 succeeded. Live acceptance run 35749692904 failed overall: GitHub 5 passed / 2 failed; Worker 5 passed / 2 failed; Pages DNS failed before browser execution. Artifacts were downloaded, hashes checked, results parsed and real Worker screenshots inspected. No feedback-status write was performed; feedback28 remains open. The fresh export at 2026-09-22T15:48:37.612Z has ten open IDs, including new 29 and 30. No automatic future monitoring or additional task was created.

Previous progress is preserved in the 232633, 233650 and 234430 checkpoint files from this chat. Do not restart from the already merged PR131 in the next continuation.

## User-visible progress since the last checkpoint

PR #132 的四组正式检查已全部通过，修复已合并。现在用修复后的版本重新验收 GitHub 和 Worker 入口，并补测另一浏览器仅显示静态预览的情况。

又收到新吐槽 #30：“阅读状态的环绕光效可以多样化可选择一点。”已与 #29 摘要窗口放大一起保留在待办中，没有混入这次原图修复。

修复版已在两个入口上线，原图字节校验和本地读取检查都通过了；整体验收仍有遗留：Worker 的部分静态文件请求报跨域错误，GitHub 的动图及预览检查未全通过。第 28 条继续保持未关闭。

## Final reply

**第 28 条的原图/GIF 功能已发布到 GitHub Pages 和 Worker 两个入口，但尚未全部验收通过。** PR #131、#132 均已合并，当前修复提交为 `0067a49`，不再是上一轮“代码已完成、尚未上线”的状态。fileciteturn176file0L2-L2

本轮还修掉了一个实际问题：**Worker 入口会把本地原图的 `blob:` 地址误转成网络请求。** 现在本地图片读取保持在浏览器内，新增了对应的防回归测试。fileciteturn147file0L4-L9

### 线上实测结果

两个入口均通过了 **30MB 原图字节校验、上传失败保留旧图、上传途中移除防回写，以及本地图片地址不被改写**等检查。但完整测试结果仍是：fileciteturn176file0L2-L2

| 入口 | 当前结果 |
|---|---|
| GitHub Pages | **5 项通过、2 项未通过**：一项新浏览器预览状态等待超时，一项桌面端 GIF 帧变化检测超时。 |
| Worker | **5 项通过、2 项未通过**：手机、桌面的 GIF 播放、刷新恢复和图片查看操作均通过，但最后的页面错误检查捕获了静态文件跨域错误。 |
| Cloudflare Pages 备用站 | 测试端仍无法解析域名，未能进行功能验收。 |

上述失败记录均已保留，**第 28 条没有提前关闭**；也不能把测试中的动图超时直接等同于所有用户的 GIF 都无法播放。fileciteturn176file0L2-L2

原图和 GIF 动画仍限于**同一浏览器、同一网站入口**保存；跨设备同步的是静态预览，不是原图云备份。本批没有修改抓图链路，也没有解决或人为增加真实阅读人数。fileciteturn176file0L2-L2

新增 **#29“摘要窗口再大一点”**和 **#30“阅读状态环绕光效可选择”**都已接收，尚未实现。下一批先处理上述跨域与显示稳定性遗留，再接这两条界面优化；摘要继续保持非全屏。fileciteturn176file0L2-L2

[查看线上手机端截图（使用测试 GIF）](sandbox:/mnt/data/feedback28-live-status-mobile.png) · [完整线上验收记录与截图](sandbox:/mnt/data/feedback28-deployment-live-results.zip)
