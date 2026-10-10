# PDF diagnostic: computer screenshot attachment not readable

Date: 2026-10-10 (Beijing). User message: '这是电脑的界面' with an inline screenshot.
Context: approved PDF transfer timeout repair, draft PR #464, route flag enabled:false.

Current attachment listing in this turn exposed only the preceding mobile JPEG (Nature Communications 10.1038/s41467-026-78405-z, 20.8s Range timeout, 512KiB downloaded) and earlier desktop screenshot files. The newly referenced desktop screenshot was not separately accessible for pixel inspection in the active session. Do not infer its exact diagnostic details or pretend it has been seen.

User-visible reply:

目前我这边没有成功读取到**这次新发的电脑截图**，能够核实的仍是之前那张手机截图。因此不能把手机上的 20.8 秒、512KiB 数据当作新的电脑结果。请重新上传电脑截图，保留底部完整的“阶段、错误代码、耗时、分段请求次数、分段响应、已读/传输字节、授权线路”，并尽可能包含网页地址栏或 DOI。无需提供任何 token、Network 请求头或私有 PDF 链接。

当前可确定的是：正式 Gallery PDF 阅读器仍未切入腾讯线路；兼容最新 main 的 PR #464 已通过 Chromium 43/43 与本地 Vault 23/23 测试，但尚未合并，公开开关 enabled:false。不同设备的正式页面失败不能等同于腾讯网关大段 Range 失败。此前 16B 已通过，下一步需要同 DOI 的独立授权主/腾讯最大 1MiB 完整 Range 比较和真实第一页/第二页验收。暂不重复安装或更改现有 PDF 画质、分段大小、连续滚动。
