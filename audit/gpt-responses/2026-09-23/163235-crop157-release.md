# UI / feedback continuation — direct image crop release

Beijing time: 2026-09-23 16:32:35 +08:00
User request: 继续；接续“继续，并且把图片裁切相关也解决。目前还是只有整图”。
Scope: PR157 direct reversible reading-status cropping and local manual cutout. Navigation PR150 remains untouched after earlier blocked writes; no blocked code was moved into this feature.
Tested head: a4c035eed4911d1759509c989d13ce57ba46e0d4.
Merged/deployed commit: 583c084322d456a01f32b884f3cab7e9638e7a66.
Evidence record: audit/ui-feedback/2026-09-23-162900-crop157-release.json, commit348576a1402c0bbb4410cc1da09bd277348f3bd7.
Live run35836653591: all four jobs successful,40/40 exact crop UI cases, no failed/skipped/flaky. Final CI13/13 each browser,3 pure pixel controls each, original18/18, all9 workflows successful. API responses mocked; no physical-device or real signed-in synchronization claim.
Fresh feedback export35836143802,2026-09-23T08:16:02.259Z:12 open entries. No feedback status changed.31 still includes automatic semantic person extraction; manual/simple-background tools do not close that requirement.
Artifacts confirmed and created at /mnt/data: image-crop-live-mobile.png, image-crop-live-circle.png, image-crop-live-portrait.png, image-crop-release-evidence.zip. Actual screenshots inspected; test color blocks only, not real paper images.

## User-visible progress messages

继续完成图片裁切这一批。我先核对 PR #157 的最新测试结果，重点确认已上传图片能直接裁切、刷新后保留选区，并可恢复原图。

裁切专项和原图回归已通过，但总质量检查仍有失败。我先定位剩余问题，不把“专项通过”当作已经上线。

已定位一处兼容问题：裁切后仍保留原图备份，旧显示逻辑因此误把它当整图，丢掉状态标签的颜色和形状。我会修正显示分支，保留原图恢复功能。

兼容修复已写入，还补了拖动选区、调整大小、键盘移动和缩放的测试。裁切结果与原图现在分开保存，避免刷新时被整图覆盖。

裁切新增的 9 项检查已通过，原图恢复和圆形透明边缘也正常。旧回归另外暴露了原图加载等待和测试请求隔离问题，我正在处理，避免裁切上线后影响原图显示。

已补上原图加载的有界等待，并让多个卡片复用同一次图片校验；测试也改为拦截本地 API 请求。现有错误检查全部保留，正在跑完整回归。

裁切及加载保护测试已在 WebKit、Chromium 中各通过 13 项，包含竖图坐标、圆形透明边缘、重新裁切和原图恢复。原图、卡片光效与摘要回归也已通过；现在等待总质量检查完成，再验收线上入口。

PR #157 已通过全部质量检查并合并。接下来验证两个线上入口：重点检查裁切保存后是否只显示选区、刷新是否保留，以及恢复原图是否正常。

两个线上入口的裁切验收已完成：WebKit、Chromium 均各通过 10 项。已确认保存的是选区像素、圆形四角真正透明，刷新后仍保留裁切结果，原图可以恢复。

## Final reply

**阅读状态图片的裁切功能已上线，GitHub Pages 和 Worker 两个入口均已通过线上验收。** 已上传的整图现在可以直接裁切，不需要重新上传。对应 PR #157，发布版本 `583c084`。fileciteturn950file0L4-L16

### 现在怎样使用

刷新网页后，打开卡片的 **“阅读状态” → 已上传图片旁的“裁切图片 / 抠图”**。选择方形、圆形、自由矩形或横向 3:1，拖动选区、调整大小，确认预览后点击 **“使用 / Apply”**。也可以直接输入像素坐标和尺寸；用户中心的状态图片设置中也有裁切入口。fileciteturn950file0L8-L8

**保存的是真正的选区图片，不是把整图缩小显示。** 圆形裁切的四角实际透明；刷新后仍显示裁切结果，不会又被完整原图覆盖。已有裁切可以继续编辑，也能分别查看裁切图、查看原图或恢复原图。取消操作或保存失败时，保留原设置。fileciteturn953file0L2-L2

[查看手机端裁切实测图](sandbox:/mnt/data/image-crop-live-mobile.png) · [查看圆形裁切实测图](sandbox:/mnt/data/image-crop-live-circle.png)

截图使用测试色块，用于核验选区和透明边缘，不是真实文献图片。

### 抠图能力与限制

已提供 **“去除边缘背景”、擦除笔、恢复笔和撤销**，处理在浏览器内进行。简单背景可以使用背景去除，复杂背景则需要手动处理。**自动识别人像的一键 AI 抠图尚未实现**，因此第 31 条中的这部分需求仍保留，没有整条关闭。fileciteturn953file0L2-L2

文件上限仍为 **30MB**，用于状态标记的裁切结果最长边为 **512 像素**，原文件另行保留。GIF 裁切结果是静态 PNG；本浏览器仍保存原文件时，可以恢复原图和动画。原文件仍限于当前浏览器、当前网站入口保存，不是原图云备份。fileciteturn950file0L8-L8

### 验收结果

合并前，裁切与加载保护专项在 WebKit、Chromium 中各 **13/13 通过**，原图回归 **18/18 通过**。上线后，两个入口在两种浏览器下均为 **10/10，共 40 项全部通过**，本批线上裁切检查没有遗留失败。测试覆盖选区像素、圆形透明度、竖图拖动、刷新保留、原图恢复和保存失败保护；后端接口被模拟，没有写入真实阅读人数。fileciteturn953file0L2-L2

本批没有修改文献数据、抓图链路或卡片光效；顶部／底部导航及真实阅读人数偏少的问题仍单独保留。fileciteturn953file0L2-L2

[查看完整测试、线上截图与验收记录](sandbox:/mnt/data/image-crop-release-evidence.zip)
