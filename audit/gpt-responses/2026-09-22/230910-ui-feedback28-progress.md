# UI feedback 28 continuation — progress checkpoint

Beijing time: 2026-09-22 23:09:10 +08:00
Context: 用户“继续”；接续吐槽与界面优化，实施第28条。
Feature branch: feat/ui-status-original-images-20260922
Baseline: e1c3e39d9543d514107f515926acd548570c8903
Fresh feedback snapshot: run 35741850015, generatedAt 2026-09-22T14:39:44.448Z, eight open IDs [28,25,24,23,22,21,20,8]. No feedback statuses changed.

Current state: feature branch only; no PR/merge/deployment yet. Typecheck and Vite build passed; original Blob storage failed browser tests. Runs 35743954050 and 35744676540 are failed evidence, not successes. Diagnostic run confirmed image decoding/preview reached IndexedDB write, then image_storage_failed. Commit 068fb34bf06aa69fa95e5b67b80d44227e7f5424 changes storage to original ArrayBuffer bytes plus MIME; ddbd7a64d88ba99445d995c17d133e175833c141 triggers full retest run 35745260747, still in progress at this checkpoint. Temporary workbench code is not a release candidate and must be removed from the final diff.

Scope: original bytes and GIF animation are browser/origin-local; account synchronization carries a small static preview and metadata only. This batch does not provide cross-device original/GIF sync. No literature data, publication gates, TOC/figure capture code, Bridge source or production reader events changed.

## User-visible progress messages

接着处理第 28 条：状态图片直接显示、保留原图、支持 GIF 和 30MB 文件。先核对最新代码与吐槽，再分批实现和测试；抓图链路不改。

第 28 条的原话已核对：希望状态标记直接显示上传图片，而不是小图标，并保留 GIF。原文件会单独存放，避免把大图塞进现有偏好数据。

本批先把原图保存、GIF 播放和刷新恢复做成完整闭环。大图采用浏览器文件存储；同时保留轻量预览，兼容现有账号同步。citeturn994991search0

最新导出还有 8 条未关闭吐槽，#28 仍在队列中。这里会保留原图比例，并明确标注：本批原图和 GIF 保存在当前浏览器，跨设备同步仍使用预览图。

实现按两条路径区分：上传后默认直接显示原图；需要裁切时再主动选择“静态裁切”。这样 GIF 不会默认变成单帧图，也保留原有裁切功能。

代码已加入原图与预览分离存储、刷新恢复、失败时保留旧图，以及防止慢上传覆盖新设置的保护。接下来测试 GIF 实际播放、30MB 边界和原有交互。

原图存储与格式校验代码已提交到隔离分支。正在接入卡片和用户中心；不会改动已上线的收藏逻辑、文献数据或图片抓取代码。

失败处理也已接入：文件过大、格式损坏或浏览器存储失败时，会显示明确提示并保留旧图；移除图片后，仍在处理的上传不能把它重新恢复。随后用回归测试验证。

现在开始运行两组测试：新增的原图/GIF、30MB 边界和失败保护测试，以及原有 13 项界面回归。测试使用隔离数据，不会增加真实阅读人数。

类型检查和生产构建已通过，浏览器测试正在执行。GIF 测试会检查实际帧变化和原文件哈希，不会仅凭出现一张图片就判定动画正常。

首轮浏览器测试发现上传仍会进入“保存失败”，因此没有合并或上线。我正在追踪具体异常；构建通过不能替代实际上传验证。

异常已缩小到浏览器数据库写入阶段，读取图片和生成预览都已完成。我会改为保存原始字节，再用哈希验证文件没有被压缩或改变。
