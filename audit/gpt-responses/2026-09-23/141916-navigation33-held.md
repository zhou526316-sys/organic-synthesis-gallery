# UI / feedback continuation — navigation33 held

Beijing time: 2026-09-23 14:19:16 +08:00
User request: 继续, after the release of card-only glow PR147.
Scope: independent top/bottom navigation for feedback33; read-only inspection of feedback34. No literature/publication/capture/Bridge or production reader-count changes.
PR150 branch: feat/ui-page-navigation-20260923-1405.
Current head: 001940a3efca53f83dee4195792454a16fd06e0d. Unmerged, not deployed.
Files: src/user-ui/page-navigation.ts, one import in src/bootstrap.ts, tests/page-navigation.spec.ts and page-navigation-ci.yml.

Fresh open feedback export35825204658 / artifact10734272936, generated2026-09-23T06:05:58.973Z:12 entries [8,20,21,22,23,24,25,28,31,32,33,34]. SHA2565ec4435783d848dc6e11bfd820045caf6e1ef1c626f657ab82663c64aab79d7f verified locally. No feedback status updates.

Initial Chromium run35825466285:4/6; long smooth-scroll journeys stopped before the document end. Artifact10734764101 SHA256f1808610ecfb3533be52dbec026e9ded99e56c12c5b32521f50b837ebabff2fe retained and parsed.
Changed source001940a now uses instant jumps for distances greater than two screens or reduced motion, retaining smooth short moves. Same unchanged assertions, not an unchanged retry.
Current run35825701506:WebKit5/6,Chromium4/6,no skipped/flaky. Both320px Top clicks are intercepted by the actual .site-feedback-tab. Chromium desktop initially reaches the bottom but its disabled state does not remain correct after layout settling. Inspected actual mobile screenshot. The original assumption of a right-side feedback tab was incorrect; the observed default tab is at the left. WebKit desktop roundtrip/node identity, keyboard/languages/reduced motion, real drawer/image viewer coexistence, short/extended page resize and reconnect/print all pass.
Artifacts:10735162023 WebKit SHA256240ccc33a6dedb652d5cb081d346bb50615da4e8d170c46cfacc7aa7e1cd12a7;10735300360 Chromium SHA256dfeb35361498cd3a86b8e160983fb58d1f34b56d95243f16db4d9b3eaf31b46e. Both downloaded, hashes checked and JSON/error context parsed. Other current-head workflows observed successful:original images35825701539,card glow35825701573,presentation35825701530,refresh cost35825701515,migration35825701568,data35825701479. Generic quality was still in progress at the last read; it is not reported as green.

The later source update proposing right-side placement and1.5s event-driven edge settling was blocked by the tool safety check (unable to determine request safety state). No alternate write route or merge was attempted. Readback confirmed current file blob a40be6a81f63cea2a8b855eb53dd28eb9670a7bd still has LEFT positioning and no edge-settling patch. This uncommitted proposal has no successful test result. PR metadata now explicitly says Hold/not ready for merge.

Feedback34 inspection:current src/media-enhancements.ts blob a4113d780238c4c8cdba91403c1129ae5db871eb uses one-pointer drag handling; no two-pointer distance/focal-point calculation. No pinch implementation made this turn. Consulted W3C Pointer Events and official Playwright touch guidance for later planning; no external-source copy or media acquisition change.

Local evidence bundle navigation33-checkpoint-evidence.zip created and confirmed at /mnt/data; includes three CI ZIPs, checkpoint JSON and Chinese README. Screenshots/mock reader counts are not production inventory or real-reader evidence.

## Progress messages

继续从已上线的卡片光效版本接续。本轮先处理“回到顶部／底部”，并核对手机双指缩放的现状，不重复改动已完成的光效和抓图逻辑。

#33 的需求是顶部／底部快捷跳转；#34 是图片放大后用双指缩放。我会将导航做成独立控件，避免遮挡吐槽入口和图片查看窗口。

图片查看器目前只有单指拖动，没有双指距离计算，#34 需要新增手势处理。本批先完成顶部／底部导航，让新功能独立上线，不再被上一批验收遗留反复阻塞。

导航候选版已完成：左下角两个按钮，分别跳到页面顶部和底部；打开卡片弹窗或图片查看器时隐藏。现在开始验证真实滚动、键盘操作和小屏布局。

首次实测发现，长文献列表的平滑滚动会停在中途；直接跳转能到达底部。我会将长距离导航改为直接跳转，短距离仍保留平滑移动。

复测还发现两处问题：吐槽按钮会挡住导航，列表重排后底部位置会变化。我会将导航放到右侧，并在跳转后的短暂布局稳定期内校准底部位置；用户主动滚动时立即停止校准。

这批先停在未发布的 PR #150：移动端导航仍被吐槽按钮遮挡，Chromium 还出现了底部状态未及时更新的问题。最后一次修复写入被工具校验拦截，重新读取仓库确认没有生效，因此不会将它合并上线。

## Final reply

**第 33 条“回到顶部／底部”已做成候选版，提交到 PR #150，但本批尚未上线。** 当前代码提交为 `001940a`。fileciteturn760file0L4-L13

候选版已有顶部、底部两个按钮，支持键盘操作、中英文标签和“减少动态效果”；打开卡片弹窗或图片查看器时，导航会隐藏，关闭后恢复。长距离跳转已改为直接到达目标，避免长文献列表的平滑滚动停在中途。fileciteturn760file0L8-L8

**目前 WebKit 通过 5/6 项，Chromium 通过 4/6 项。** 剩余问题已定位：320px 手机宽度下，吐槽按钮挡住“顶部”按钮；Chromium 桌面端在列表布局变化后，底部按钮的状态未及时更新。因此不能把这批标记为完成。fileciteturn760file0L8-L8

我尝试提交“右侧定位＋短暂布局稳定期校准”的修复，但最后一次代码写入被工具校验拦截。重新读取仓库确认补丁没有生效，**所以没有合并、没有覆盖生产版本，也没有关闭第 33 条。**fileciteturn760file0L8-L8

第 34 条手机双指缩放已核对现有代码，当前仍只有单指拖动，尚未实现。本批没有改动已上线的卡片光效、抓图链路或真实阅读计数。fileciteturn760file0L8-L8

[查看本批测试记录与失败证据](sandbox:/mnt/data/navigation33-checkpoint-evidence.zip)
