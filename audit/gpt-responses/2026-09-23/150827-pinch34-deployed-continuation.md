# UI / feedback continuation — image pinch34 released, navigation33 held

Beijing time: 2026-09-23 15:08:27 +08:00
User request: 继续, after the held navigation33 checkpoint.
Repository: zhou526316-sys/organic-synthesis-gallery, main as baseline.
Implementation PR152: exact tested head a451ab58b851c8b81c0d5a161bfa1092b5fd243b merged as cd3cca0e1e2e0066895af167bd306276df0357fb at 2026-09-23T07:01:48Z.
Changes: src/user-ui/media-gestures.ts and viewer integration in src/media-enhancements.ts; fixed-pixel gesture/browser tests and three deterministic input-isolation tests. Sources/bytes/acquisition/literature/publication/count semantics unchanged. This is the TOC/body figure viewer, not the separate status-image dialog.

## Verification

All eight final-head workflows succeeded: media-pinch35828999592, originals35828999552, card-glow35828999546, presentation35828999558, refresh35828999630, quality35828999535, migration35828999536, data35828999548. Pinch WebKit6/6 and Chromium7/7, with3 unit controls in each job. No skipped/flaky cases. Chromium includes browser-delivered trusted two-touch events; not physical-device testing. Artifacts10736865978 SHA535d1dd4312fa56cc277f26376f2f5bc3b29733c9dfbb00e3bc69f0bd21492aa and10736272121 SHA22c67ba15224c6ba8a7f481ff268007e6a951df17960bbc2a7dfffa48462797d inspected.
Earlier failures retained: SVG natural-size precondition on WebKit; after fixed PNG input, WebKit4/6 with post-screenshot one-finger continuation failures. Added consistent pointerType checks on move/end and deterministic foreign-type negative controls; unchanged browser assertions then passed. The precise origin of every prior compatibility event was not traced, so do not overstate a proven browser-internal root cause. No tolerance/timeout relaxation or screenshot-driver change in this feature.

Deployments: GitHub Pages35829591619 succeeded, actual Worker deployment35829598090 succeeded. Cloudflare Pages fallback35829591639 failed; no update/recovery claim for that entry.
Live workflow .github/workflows/media-pinch-live.yml, commit50f088305ea7e3ae03e2c48164b452d643f1def0, run35829660884. Checkout fixed mergeSHA; original test file accepts LIVE_SITE_URL and is not rewritten; no local preview server or production source-method patch. APIs mocked, no real reader marks; explicit PNG image input fixtures.
Live results: Worker WebKit6/6, Chromium7/7; GitHub Chromium7/7, WebKit5/6. No skips/flakes. Four archives downloaded, hashes checked and reports/screenshots inspected:
-10736922121 worker-webkit SHA7d0ba6fdd4da4e801e1165449b9f1104d5c2cf77d5f2629b08e7d0a40211f26d.
-10736188177 worker-chromium SHA0704948ebe8afed4347c5d5982f6457ddcbd97d639da37b777095ea3842893a0.
-10736203086 github-chromium SHA77ca17faa30f58dbc5b6a49bd7e3f8d3b79607aae6a8f9539e36027cf33941b5.
-10736278010 github-webkit SHA0003aa7290ff30fbc066d059ea197aae39f28a2ce50481095aa3fc82d84f5db1.
The GitHub WebKit image-switch/resize/close case failed in open() line48: after the initial fixture click, .media-viewer was absent within5s. That case's gesture assertions did not execute. Its pageerror/reader-mark arrays were empty. The two390/1280 focal-point and one-finger continuation cases, scale limits, cancellation and mouse cases passed on both entries. No blind rerun or assertion removal;34 remains open. Next acceptance work should distinguish dynamic viewer readiness from click handling, not reimplement already-passing pinch arithmetic.

## Held navigation and queue

The normal update_file attempt for navigation33 was blocked again by the tool safety check; source readback remains blob a40be6a81f63cea2a8b855eb53dd28eb9670a7bd with left positioning. No alternate write path, nav branch transfer or merge attempted. PR150 is unchanged and held. PR152 is independent and contains none of the blocked navigation code. PR150 comment5790394842 records this boundary.
Fresh read-only export35829819724 / artifact10736946812 SHA6946c14224ae68aba737f775ce610467b4de028147e185268e5a5771537e61fd generated2026-09-23T07:04:28.605Z. D1/R2 reads available,12 open IDs[8,20,21,22,23,24,25,28,31,32,33,34]. No feedback status writes.32 timing cases,31 smart/person/circular cropping,28 broader originals and true low-reader totals remain pending. No capture/Tampermonkey/Bridge, literature/publication or automation edits.
Conversation artifacts created and paths confirmed: /mnt/data/pinch34-release-evidence.zip (before/after CI, four live reports, screenshots, JSON and Chinese README), /mnt/data/pinch34-live-mobile.png, /mnt/data/pinch34-live-desktop.png. Images are test-fixture evidence, not actual literature images or production count evidence.

## User-visible progress messages

继续处理第 33 条的两处问题：导航被吐槽按钮遮挡，以及列表重排后底部位置变化。先核对最新分支，再修复并复测，不重复改卡片光效。

最新分支仍保留两处已知问题，尚未合并。本轮只调整导航位置和跳转后的定位逻辑，保留现有测试标准，不放宽通过条件。

导航补丁写入再次被工具校验拦截，仍未生效，PR #150 保持未合并。本轮转到独立的第 34 条“手机图片双指缩放”，不改导航或抓图链路。

双指缩放会以两指中点为中心，尽量避免图片跳位；松开一指后可继续拖动。接下来验证放大、缩小、取消手势和切换图片。

双指手势已接入候选分支，尚未发布。测试会同时检查缩放焦点、原图地址、单指续拖和鼠标操作，并增加浏览器投递的双触点测试。

改动只涉及 TOC／正文图查看器的手势处理，取图地址和缩放按钮逻辑均保留。编译已通过，浏览器回归正在执行；导航 PR 仍未改动。

Chromium 的 7 项测试已通过，包括浏览器投递的双指手势。WebKit 在测试图的尺寸校验处停住，尚未执行手势断言；我会改用固定像素 PNG 测试图复核，保留缩放和定位的检查标准。

PNG 复测后，WebKit 已通过 4/6 项；两项失败都发生在“双指缩放后转为单指拖动”。缩放比例和焦点检查已通过。我会再核对鼠标与触摸事件是否混入同一条手势，暂不发布。

手势专项现已全部通过：WebKit 6/6、Chromium 7/7，另有 3 项输入隔离与清理测试通过。此前失败的“双指转单指”也已通过；目前在核对原图、卡片光效和总质量检查。

PR #152 已通过全部八项检查并合并。接下来验收两个公开入口，确认网页实际加载了双指缩放，而不只看构建结果。

Worker 部署已成功，公开页面测试正在执行。测试覆盖图片缩放、双指转单指拖动，以及关闭后恢复页面滚动；备用站本次部署仍失败，不能算作已更新。

GitHub Pages 和 Worker 都已部署完成。线上测试正在收尾，我会逐项读取结果和截图，再确认第 34 条是否可以关闭；第 33 条导航仍保持未发布。

线上复测中，Worker 两种浏览器全部通过，GitHub 的 Chromium 也全部通过。GitHub 的 WebKit 有一项在打开图片查看器时未通过；双指缩放和单指续拖检查已通过，第 34 条暂不关闭。

## Final reply

**第 34 条“手机图片双指缩放”已上线到 GitHub Pages 和 Worker。** 对应 PR #152，发布版本为 `cd3cca0`；第 33 条顶部／底部导航仍未上线。fileciteturn828file0L4-L16

### 现在可以怎样操作

点击卡片上的 **TOC 或正文小图**进入图片查看器后，双指张开可放大、合拢可缩小；缩放围绕两指中点进行，松开一指后可以继续拖动图片。原来的放大、缩小、Fit、1:1、鼠标滚轮和键盘操作保留，原图地址与文件内容不变。fileciteturn828file0L8-L8

这批还补上了鼠标与触摸事件的隔离，避免不同输入设备的事件干扰正在进行的手势；切图、调整窗口和关闭查看器时会清除手势状态。fileciteturn828file0L8-L8

### 线上验收结果

合并前八项质量检查全部通过。部署后，使用已上线页面再次测试：fileciteturn828file0L8-L8

| 入口 | Chromium | WebKit |
|---|---:|---:|
| Worker | **7/7 通过** | **6/6 通过** |
| GitHub Pages | **7/7 通过** | **5/6 通过** |

GitHub 的唯一遗留发生在一项测试的**初始打开图片窗口**环节：点击后 5 秒内没有出现查看器，因此该项后续的切图、窗口调整和关闭检查没有执行。其余双指缩放、焦点保持、单指续拖等检查已通过；**第 34 条仍保留这项验收遗留，没有提前关闭。**fileciteturn828file0L8-L8

这些是自动化浏览器测试，其中 Chromium 包含浏览器投递的双触点事件，**不是实体手机实测**。截图使用明确标注的测试图，不是真实文献内容。fileciteturn828file0L8-L8

[查看双指放大后的手机端实测图](sandbox:/mnt/data/pinch34-live-mobile.png) · [完整测试与上线验收记录](sandbox:/mnt/data/pinch34-release-evidence.zip)

第 33 条导航补丁的写入再次被工具校验拦截，PR #150 保持未合并。本轮没有改动卡片光效、抓图链路、文献数据或真实阅读计数；Cloudflare Pages 备用站的本次部署仍失败，也未算作更新成功。fileciteturn828file0L8-L8
