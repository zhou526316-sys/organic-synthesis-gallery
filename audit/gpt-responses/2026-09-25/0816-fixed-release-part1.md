北京时间 2026-09-25 08:00 固定生产发布已完成闭环，最终状态为 synced_with_pending。本槽完整 handoff 共审核 162 篇：19 篇 include 已正式发布、142 篇 exclude、1 篇 evidence-pending；生产卡片由 566 增至 585。唯一 deferred DOI 为 10.31635/ccschem.026.202608262，未进入生产，也没有被强行改成 exclude。

本槽使用的冻结 staging 为 audit/prepublish-review-2026-09-25-0800.json，其 handoff 生成于北京时间 07:09:56，处于允许的槽前窗口。实际 prepublish gate run 36072173805 成功，严格转换和两项 allow-deferred/require-ready 检查均通过。固定槽 release writer run 36075887801 成功，原子生产 commit 为 648064f332f8f000b7143ef87f1bbc6495afe59c。19 个新 include 的 titleZh 已逐项复核，均存在、非空且不是英文原题占位。
