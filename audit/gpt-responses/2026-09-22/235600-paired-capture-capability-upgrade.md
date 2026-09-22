# Paired capture and acquisition-quality upgrade

Beijing time: 2026-09-22 23:56 +08:00.
Context: user requests upgrading remaining Tampermonkey capture, processing TOC and article figures in one article visit, and improving acquisition quality.
Tested feature commit: 4746f9edb970995039e95dfa21a4da442b843733, branch fix/media-identity-v220, draft PR #129.
Successful test run: 35749982883; artifact 10704384118; independently verified archive SHA256 015027cb067ef7f2df5db672387a8499c14e34f818e1f107114d5b6bff0ff79e.
Detailed audit commit: 84c06c6a3edb8ccd60f137ab618a687e138f8064.
This turn made no production media/data changes or userscript release. Branch-only source changes and main audit records.

## Progress messages

这次按“同一篇文章、同一次打开”合并抓取 TOC 和正文 Figures/Schemes，两类结果分别记录，不能再把 TOC 成功当成整篇完成。我先接上升级分支，核对任务绑定和暂存到展示的衔接，验收后再给你安装链接。

抓取质量也一起升级：高清候选按实际图片尺寸择优，SVG 不再简单按缩略图尺寸淘汰，Figure/Scheme 必须与各自图注绑定。会先用你这轮的失败样本做回归测试，不直接增加并发，以免再次串页或触发出版社限制。

又找到一个影响清晰度的具体问题：即使选中了高清 URL，旧代码也可能改用页面上正在显示的缩略图地址。我已把修复加入升级分支，并将两类抓取结果分开处理：找不到 TOC 仍继续抓正文图，正文图部分失败也不丢弃已经抓到的 TOC。

## Final reply

**抓取能力已一起加入 2.2.20 升级分支，并完成本轮浏览器回归测试；但还没有发布到安装链接，你已安装的 2.2.19 暂时不会获得这些改动。** fileciteturn439file0L2-L2

### 单篇文献改为一次打开、两类图片一起处理

新版按 DOI 合并任务：打开一篇全文页面，在同一次访问中处理 TOC 和正文 Figure／Scheme／Chart，不再拆成两轮打开。**找不到 TOC 仍继续抓正文图；正文图部分失败，也保留已经抓到的 TOC。** 已有官方 TOC 的文章则保留原图，继续补正文图。fileciteturn439file0L2-L2

正文图处理上限由原来的 **5 张提高到每篇最多 20 张**，按独立图号计数，不把同一图的不同分辨率重复计数；达到数量或时间上限会标为“部分完成”，不会声称已经收齐全文所有图片。fileciteturn439file0L2-L2

### 抓取质量的实际改动

**高清地址不再被缩略图地址覆盖。** 修复了选中高清 URL 后，又使用页面当前缩略图地址的问题；每个图号最多比较四个候选，按实际尺寸或经检查的矢量结构择优，同次任务重复遇到同一 URL 时复用下载结果。fileciteturn439file0L2-L2

**SVG 与普通位图分开判断。** 真正的矢量图不再仅因显示宽度较小而被判成低清；混合矢量／位图会单独标记，普通低分辨率 PNG、JPEG 等没有通过降低门槛被冒充高清。同时，图片只绑定自身 Figure/Scheme 的图注，排除相关推荐区域，避免相邻正文图借用“Visual Abstract”标题而被误当 TOC。fileciteturn439file0L2-L2

### 本轮验证结果与发布边界

**47 项检查通过：21 项任务归属检查、9 项上传回执检查、17 项 Chromium 浏览器测试。** 浏览器测试实际跑通了“同一次访问取得 1 张 TOC＋2 张正文图”；移除 TOC 后，仍能取得这 2 张正文图，并正确记为部分完成。不过，这是受控测试页面，不是已经通过你 VPN 下所有出版社的实测。fileciteturn439file0L2-L2

**现在还不能直接让你启动全库抓取。** 正文 SVG 从暂存转入正式图库的衔接、完整新队列的实际发布，以及升级包与 Worker 的联调仍未收尾。只先发脚本，仍可能重现“已经抓到、网页却看不到”的问题。本轮没有动已恢复的 TOC，也没有删除任何图片。fileciteturn439file0L2-L2

你这边保留现有脚本和密钥、暂不恢复全库抓取即可，不需要重新上传日志。
