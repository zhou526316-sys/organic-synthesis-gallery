# Gallery 界面优化：新吐槽核实结果
Beijing time: 2026-10-08 23:28 +08:00
Conversation/task: 接续界面优化 — “解决新吐槽”
Related diagnostic-only commit: fbfca63482c3ae139915d41a0336cf98a584b356
Current feedback snapshot: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37800022262
No repair, live feedback-status mutation, or production deployment was made.

我已重新读取 Gallery 的最新反馈。北京时间 23:21 的记录显示**开放反馈共 15 条**；与今天早晨的记录相比，新增的是 **#42**。此前的 #40、#41 也仍处于开放状态。

1. **#42｜阅读状态弹窗方向错误。** 用户截图显示弹窗向下展开、下方内容不易操作。已在 `src/user-ui/paper-actions.ts` 找到原因：只要下方空间达到约 220px，即使上方明显更宽裕，也可能强行向下展开。建议优先选择能完整容纳弹窗的一侧，否则选择剩余空间较大的一侧，并限制高度、保证手机端可操作。**截图与代码已确认缺陷机制；线上浏览器自动点击因控件重渲染未完成。**

2. **#40｜不显示“正文图待抓取”。** 正式网页英文模式中未见该原始中文短语，但确实仍能看到 `Fetching original TOC / Figure` 这类抓取过程提示，中文代码也保留“正在获取原始 TOC / Figure”。建议普通用户界面只展示简洁的图像占位，不展示内部抓取流程文字；后台诊断信息照常保留。

3. **#41｜手机加载和 TOC 太慢。** 反馈属实存在，但尚无可靠的手机端测速数据。代码检查发现媒体索引和多张 TOC 可能在首屏并行加载，值得排查。建议先记录首屏耗时、首张 TOC 出现时间和重复请求，再有针对性优化，避免为了“提速”损害可见图片的加载。

以上均未修改代码或关闭反馈，符合此前约定的**先核实、再由你批准**规则。诊断记录：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/ui-feedback/2026-10-08-2321-new-feedback-40-41-42-verification-hold.md

**请确认：是否批准修复 #42 和 #40，同时先对 #41 进行性能实测后再确定具体改动？**
