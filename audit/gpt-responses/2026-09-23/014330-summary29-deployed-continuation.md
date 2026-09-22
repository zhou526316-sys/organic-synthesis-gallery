# UI / feedback continuation — larger summaries

Beijing time: 2026-09-23 01:43:30 +08:00
User request: 继续（连续两条）
Context: 接续吐槽和界面优化，复用状态图片预览修复，完成第29条摘要窗口放大的实现、测试、合并与部署。
Implementation PR139 tested head: 44ef4ee3b44c82d03443fe04fc63457ab4cf31ac
Merge: b00b03aa03d3dccb7a46ac6bd54d51392029de34
Live workflow commits: 511dd3a21b62ca7cdcbfcf81bf5d9e67987c04c0, e1ede7ae5a15b1bffc0a0abfbaef4c27d263d9dc
Audit record: audit/ui-feedback/2026-09-23-013930-summary29-release.json, commit20365a6fdfaa347ea6624d031d05018d3ee024f5
Latest actual live run35761048963: Worker6/6, GitHub5/6, Cloudflare Pages DNS preflight failed. No feedback statuses changed by this chat.
Concurrent handling: reused merged PR137 e474cc4b027ea8ed0842eeed7f9fb869a186d2a0; discovered overlapping PR138 and posted coordination comments before/after selecting the independently verified PR139. PR138 branch was not overwritten or merged.

## User-visible progress messages

继续接上：先核对最新代码，修正状态图片的预览标识，再处理 #29 摘要窗口放大，保持非全屏。

当前代码要等原图查询结束才标记预览状态，查询慢时会出现“图片已显示、状态却未确定”。我会让预览立即可用，原图读取成功后再切换。fileciteturn249file0L2-L2

发现另一窗口已提交同一预览修复 PR #137，我会复用并检查它，避免重复改动。本轮接着做 #29：扩大摘要阅读区域、放大正文，同时保留 TOC 和中英文切换。fileciteturn255file0L2-L2

摘要布局已写入分支：桌面宽度上限改为 1080px，正文改为桌面 15px、手机 14px；屏幕边缘保留留白。正在补测长摘要滚动、窗口缩放和关闭按钮是否始终可用。

#29 已形成独立 PR #139，开始运行新布局测试和原有回归检查。测试会实际打开长摘要、切换语言并缩放窗口，不只检查 CSS 数值。fileciteturn272file0L2-L13

摘要新版已通过类型检查和生产构建，浏览器测试正在检查四种屏幕尺寸。原图预览修复 #137 也已合并，本轮没有重复修改它。fileciteturn276file0L4-L16

首轮测试发现，小屏重排后的面板边缘定位还需修正。TOC 测试也出现了尺寸不符，我会改用固定像素的测试图片，并保留越界和图像加载检查。

新版还处理了按钮靠近屏幕底部的情况：摘要不再被压成很矮的小框，而是在保留留白的前提下移入可视区域。收藏等小弹框继续保持原来的按钮旁定位。fileciteturn274file0L8-L13

四种固定屏幕尺寸的测试已通过，包括文字大小、TOC、中英文切换和滚动后的关闭操作。还剩一个问题：摘要打开后切换到横屏，面板底部仍会越界；我正在修正动态重排。

摘要专项现在 **6 项全部通过**，横竖屏切换后的越界也已修正。原图回归、数据校验和迁移检查均通过；正在等最后一组通用交互检查，再进行上线验收。

#29 已合并为 `b00b03a`，部署已触发。现在检查公开网页是否加载了新版本，并复测手机、桌面及横屏的摘要窗口；测试会使用标明用途的摘要和 TOC 示例，不向生产服务生成测试摘要。

公开页面已显示放大的摘要窗口。Worker 的 6 项检查全部通过；GitHub 的四种尺寸和动态缩放也通过了，剩下一项“无 TOC”测试实际仍带着原页面的 TOC。我正在修正这个测试输入，不改动已通过的页面功能。

本轮主要功能已上线并实测：摘要放大、双语切换、四种屏幕尺寸和横竖屏重排均通过。GitHub 的“无 TOC”测试仍未成功构造空图条件，我会保留这项未通过记录，不把完整验收报成全部通过。

## Final reply

**第 29 条“全文摘要窗口再大一点”已上线到 GitHub Pages 和 Worker 两个入口。** 对应 PR #139，合并版本 `b00b03a`；现在不是仅有分支方案，公开网页已经实测到新版窗口。fileciteturn341file0L4-L16fileciteturn344file0L2-L2

### 这批实际改动

**摘要窗口变大，但仍然不是全屏。** 桌面宽度上限为 **1080px**，高度最多占可视区域的 **86%**，周围保留留白。桌面正文改为 **15px**、手机正文 **14px**，同时增大行距、标题、语言切换和关闭按钮。fileciteturn344file0L2-L2

**TOC 和中英文切换保留。** 桌面采用图片与正文分栏，手机改为上下排列；长摘要滚动后仍能使用关闭按钮。按钮靠近屏幕底部时，摘要会移入可视区域，不再被压成很矮的小框；窗口缩放后的重排也已修正。收藏等四个管理按钮及小弹框保持原有布局。fileciteturn344file0L2-L2

[查看手机端实测截图](sandbox:/mnt/data/summary29-live-mobile.png) · [查看桌面端实测截图](sandbox:/mnt/data/summary29-live-desktop.png)

截图中的文字和 TOC 是明确标注的**布局测试示例**，不是对应论文的真实摘要；本次验证的是已部署界面的展示与交互，没有向生产服务生成测试摘要。fileciteturn344file0L2-L2

### 验收结果与剩余问题

合并前的 **6 项摘要专项全部通过**，原有质量门禁及原图回归也通过。上线后的完整检查结果是：fileciteturn344file0L2-L2

| 入口 | 实际结果 |
|---|---|
| **Worker** | **6/6 通过**。 |
| **GitHub Pages** | **5/6 通过**；四种屏幕尺寸、双语切换、滚动关闭和动态缩放均通过，剩余“无 TOC”空状态测试未通过。 |
| Cloudflare Pages 备用站 | 检测端仍返回 `ENOTFOUND`，未能验收；不能据此认定所有用户均无法访问。 |

GitHub 剩余那项测试仍带有一张 TOC，**没有成功构造“无图”条件**，因此不能确认空图时的全宽布局验收完成；这不是摘要放大功能失败，但第 29 条暂未整体关闭。失败记录已保留。fileciteturn344file0L2-L2

状态图片的即时预览修复已复用合并的 PR #137，没有重复改动。**第 30 条可选环绕光效、阅读人数偏少仍待处理**；本批没有修改抓图链路、文献数据或真实阅读人数。fileciteturn344file0L2-L2

[查看本轮实现、测试与线上验收证据](sandbox:/mnt/data/summary29-release-evidence.zip)
