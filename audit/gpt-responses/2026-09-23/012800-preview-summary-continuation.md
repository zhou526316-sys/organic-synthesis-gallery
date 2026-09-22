# UI / feedback continuation

Beijing time: 2026-09-23 01:28 +08:00
User request: 继续
Context: 接续吐槽与界面优化；本批实现状态图片即时预览与非阻塞查看器，并实现更大的非全屏摘要候选版。
Preview PR137 tested head a71e2be550a098dc2d56f3ca3653db69b1b2f3dd merged by this chat as e474cc4b027ea8ed0842eeed7f9fb869a186d2a0. Source-image CI 17/17 passed; live run35758775401 remains partial.
Summary PR138 remains open, not merged, not deployed. Latest application source db5a5230fac180f1cfb9e807c316c4d06f149bce; subsequent e38ed7d9138eea113df43a260f89cd916ff05933 only adds geometry/trace diagnostics and does not establish a fix.
Final factual handoff: audit/ui-feedback/2026-09-23-012610-preview-summary-handoff.json, commit d0e23e57a4f071869f7e5ffde05a8c8319132648.
Fresh feedback export generated2026-09-22T17:05:41.720Z has10 open items. No feedback-status write, synthetic production reader event, literature/publication input or capture/Bridge source change by this chat.
All source staging helpers were removed from the summary PR final diff. No test expectation was removed to obtain green; the obsolete small-summary dimensions were intentionally replaced with the user's requested larger-size/margin contract. The next-frame viewport attempt did not fix the remaining resize failure; read new diagnostics before further source guesses.

## User-visible progress messages

继续。这一批先修正状态图片的预览显示问题，再处理 #29 摘要窗口放大，保持非全屏；已完成的请求修复不重复改动。

剩余预览问题已缩小到初始化顺序：图片已显示，但状态标记要等本地数据库返回才更新。我会让预览状态立即就绪，并检查“查看图片”是否也被这段等待阻塞。fileciteturn249file0L2-L2

“查看图片”目前也会先等待原图查询，确实可能显得点了没反应。本批改为立即打开预览，原图读取并解码成功后再替换；数据库不可用时仍可查看预览。fileciteturn249file0L2-L2

预览修复已进入 PR #137，新增了数据库延迟、拒绝访问和图片损坏的测试。接着处理 #29：扩大摘要的文字与 TOC 区域，不改变收藏、状态等小弹窗的位置。

预览专项测试已通过。#29 的布局也已接入：桌面摘要宽度上限 1200px、正文 16px，手机正文 15px；窗口保留边距，接下来检查多种屏幕下的溢出、滚动和中英文切换。

预览修复的 17 项测试和正式质量检查均已通过，PR #137 已合并。摘要放大的检查发现一处旧尺寸分支已不可达，我正在清理这处编译错误；摘要版本还没有发布。

摘要的编译错误已修正，新的完整检查已启动。窗口放大只作用于全文摘要，收藏夹和阅读状态面板仍保持贴近按钮的小弹窗。

摘要已通过编译并进入浏览器实测，正在检查手机、平板和大屏布局。我也重新读取了待处理吐槽，避免遗漏这期间的新提交。

待处理吐槽仍为 10 条，没有新增遗漏。摘要首轮的尺寸和字号检查已通过，但测试用 SVG 的固有尺寸在浏览器中不一致；已换成固定尺寸 PNG，保留原有图片解码检查。

摘要放大不改变生成逻辑：中英文仍使用同一份缓存，缺少 TOC 时文字占满阅读区。现在重点检查长摘要滚动后，关闭按钮和语言切换是否仍然好用。

摘要的 5 项测试已有 4 项通过，剩下一项发现了实际问题：手机宽度切换到桌面宽度后，窗口位置没有及时重算。我正在修正尺寸变化后的定位，不放宽边距检查。

两个公开入口已加载预览修复，“立即打开查看器、原图随后替换、关闭后不回弹”的检查通过。完整复测仍有动图帧变化、预览解码和阅读接口报错的遗留，第 28 条暂不关闭；摘要放大继续独立推进。

摘要的常规布局、滚动和中英文切换已通过；手机切到桌面宽度后的定位问题仍未通过复测，因此这版还不发布。我补上失败时的实际窗口尺寸和截图记录，下一轮据此定位，不再凭超时信息猜原因。

## Final reply

**本批已上线状态图片的即时预览；#29“摘要窗口放大”已实现候选版，但尚未上线。** 两项改动分别在 PR #137、#138 中处理，没有重复修改上一批的请求重试逻辑。fileciteturn343file0L2-L2

### 摘要窗口：新版已做出，仍有一项定位问题

候选版将桌面摘要宽度上限扩大到 **1200px**，正文调整为 **16px**，手机正文为 **15px**；TOC 同时放大，窄屏上下排列，没有 TOC 时文字占满阅读区。窗口保留边距，高度不超过可视区域的 84%，**仍然不是全屏**。收藏夹、阅读状态等小弹窗保持原来的按钮旁定位。fileciteturn341file0L8-L8

目前布局专项 **5 项中 4 项通过**。唯一未通过的是从手机宽度切换到桌面宽度后的边距检查；常规布局、字号、图片解码和中英文切换已经通过。已补充实际尺寸日志、失败截图和操作轨迹，**没有把这项失败当作已修好，也没有发布摘要新版**。fileciteturn343file0L2-L2

[查看桌面版摘要测试图](sandbox:/mnt/data/gallery-summary29-desktop-preview.png) · [查看手机版摘要测试图](sandbox:/mnt/data/gallery-summary29-mobile-preview.png)

图中使用的是明确标注的模拟摘要和 TOC，仅展示排版，不是真实文献的 AI 分析。

### 状态图片：即时预览已上线

现在点击“查看图片”会先打开预览，不再等本地数据库返回才弹窗；原图读取、解码成功后再替换，关闭后的窗口也不会被迟到的加载结果重新打开。PR #137 已合并为 `e474cc4`，合并前 **17 项专项测试全部通过**。fileciteturn343file0L2-L2

独立线上复测为 **GitHub 13/15、Worker 14/15**。遗留分别涉及新浏览器预览解码、GIF 帧变化检测，以及被测试拦截的阅读人数接口报错，因此第 28 条仍未整体关闭；Cloudflare Pages 备用站在测试端仍未通过域名解析。fileciteturn343file0L2-L2

**#30 可选光效和真实阅读人数偏少仍未解决。** 本批没有改抓图链路、文献数据或真实阅读计数；原图也仍是当前浏览器、当前入口本地保存，不是云端原图备份。fileciteturn343file0L2-L2

[本批完整测试记录、失败证据与截图](sandbox:/mnt/data/gallery-preview-summary29-evidence.zip)
