Beijing time: 2026/10/8 08:41:08
Context: continuation of feedback #41 mobile TOC performance repair after conversation disconnect.

Status: code merged and required PR regressions passed; Pages/Worker publication still in progress; do not claim production live acceptance.
Merged PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/396
Merge SHA: d3983db1850f91f38a7b735ca0f99b1b8a3f558b
Pre-merge head: 0886d5ee72ba23d152d6ddcc521df3b44dcd862f
Relevant CI: Site quality gate success; Mobile entry and TOC regression success; Pagination navigation acceptance success (Chromium retry passed; WebKit passed); target Tampermonkey, private PDF, migration, share, data validation all passed on PR.
Worker deployment run 37708812999; Pages release run 37708806202; sync run 37708806296 pending at checkpoint.

User-visible answer so far:
已从中断位置恢复，**新吐槽 #41（手机加载和 TOC 显示太慢）的优化代码已经完成**。

新版将手机首批媒体请求限制为最多 2 篇文献，优先显示首屏 TOC；向下滚动时继续加载后续图片，并延后非首屏必需的 PDF 文献库状态模块。移动端专项、整站质量门和 WebKit 分页测试已通过。

**尚未上线**：Chromium 分页测试有一项偶发的视口定位失败，正在复验。此前的修复和测试进度都已保留，不需要重新开始。

后续补充：Chromium 复验成功，全部 8 项 PR 检查通过。#396 已以 d3983db 合并，Pages 和 Worker 正在发布，需最终现网验收。
