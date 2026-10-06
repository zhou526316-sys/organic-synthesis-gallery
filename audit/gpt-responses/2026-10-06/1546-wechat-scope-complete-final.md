# GPT response sync

Beijing time: 2026-10-06 15:46
Context: 公众号两篇精选完整性与 WYSIWYG 裁图最终优化

Related commits:
- 318a4c32537e8944bfa9721acfe852c126e75212 — materialized-crop rule
- cb172b559f3b63f6ee64d6f26a74cbd31eeffe5f — final daily manifest blob
- 7979c88174aac3318e5f77d8bbaf3f44a2d5044c — final retrospective manifest blob
- 92d9bccc3dacd73eb7ef0f5ea1b50a802c6f0f03 — transport review pass
- 3752ebbd985709a66dab469f4f75febbd8f7db99 — closed final review gate

## User-visible reply

已经按这个方向优化并重新写入公众号草稿，最终回读为 `draft_readback=ok`。

这次没有从头重构，而是在现有两篇稿子上补完整：

- **Nature Chemistry 今日精选**：保留原来的“瞬态自由基如何同步生成”主线，但不再一直围绕机理打转；已经补入 Fig. 4 的底物/原料范围、官能团与片段跨度、方法边界，以及原位硼氢化和后续 Suzuki / Buchwald–Hartwig 复杂化。第一张正文图也不再是孤立且难看的 Fig. 1c，而是让完整 Fig. 1e 跟在对应解释之后。
- **Nature / Hyster 往期精选**：按“问题与创新 → 蛋白工程 → 底物拓展 → FRET 证据 → 自由基成键机理 → 激发态证据 → 审稿边界 → Lenacapavir 应用”的推进重新梳理。Fig. 3 的嘧啶和吡啶底物范围都加进去了，并重点解释哪些结构变化开始损失收率或 e.r.，而不是简单罗列产物。
- **图片链路**：两篇正文目前使用的裁图都已经先物化成独立 PNG/JPEG、逐张查看，再固定进 manifest；生产阶段不再根据 `crop_frac` 临时裁切。也就是说，以后是“我审核哪张最终图，微信就上传哪张最终图”。

两篇现在都更接近完整论文解读：既讲清核心科学问题，也有方法学范围、局限和合成意义，同时保留自己的判断，但不盖过原文研究逻辑。

你现在可以直接回公众号草稿查看最新版本。
