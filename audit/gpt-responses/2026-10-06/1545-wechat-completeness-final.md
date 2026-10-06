# GPT response sync

Beijing time: 2026-10-06 15:45
Context: 公众号两篇精选完整性与裁图最终优化

Related commits:
- 318a4c32537e8944bfa9721acfe852c126e75212 — materialized crop rule
- 9b07f61c285b658e1ae26f291b363d74a5e6757f — daily opening image placement
- 660167f764570e12c933b8618d27907942b68a48 — completeness review gate
- 80f76e693fae755da83eeb459115a6e9288646f4 — terminal WeChat sync
- 52ce730fdba23f7357c2e6793241561f0bdfa00d — transport review
- 33165ef8750db43f18f560de7e45ee3ce4cb2daa — closed final review gate

## User-visible reply

好了。最新优化版已经重新写入公众号草稿，发布链路返回 `draft_update`，并且微信 `draft/get` 回读为 `ok`。

这次已经把你刚才提的几个核心问题一起处理掉了：今日精选不再用孤立又难看的 Fig. 1c 开场，而是先把问题讲清楚，再放完整的 Fig. 1e；随后补上了真正的底物范围、合成价值和方法边界。往期精选保留你确认的蓝色 FRET/PLP* 封面和完整 Fig. 1c，总体叙事也从单一机理话题扩展到蛋白工程、底物拓展、外源/酶内 FRET、自由基成键、激发态证据、局限和 Lenacapavir 应用。

另外，截图裁图链路已经按新规则执行：所有正文裁图都先实际生成成独立 PNG/JPEG、逐张检查后再固定进仓库；最终公众号只上传这些已经审核过的图片，不再在发布时根据 `crop_frac` 临时裁切。

你现在直接去公众号后台看最新草稿就可以。
