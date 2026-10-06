# GPT response sync

Beijing time: 2026-10-06 14:02
Context: 公众号草稿接续 / pre-draft text-image review gate

Related commits:
- 40ad9d57238e0b8a3020cc1d7dea91d62223918e — project rule
- 8c6e6e1a919defc57841eaa5e6d5540f5d7d96b7 — editorial gate contract
- 7ee45a61273f131cb5f2b9178d301915f6539b79 — publisher fail-closed gate
- 4cbe82b9dafdee653722469c273996d5c46edd7c — edition manifest fingerprint
- a2d70bebfd523bd2566ddd68d72bafdc4ffd4315 — pre-draft review
- 48c9e2fce8ea8ee8de3047ee0dc5699ae1853a3c — terminal WeChat sync trigger
- 187ea402 — WeChat publisher receipt
- 63f2e3243c1e3c3adc643948b29b806f38d55908 — transport/readback QA
- 44f7958abb9a224450ad5ed31756d88d923e2a82 — closed review gate

## User-visible reply

已经按你刚才提出的新规则完整接续，而且这条规则已经不是“聊天约定”，而是项目级硬规则。

现在固定流程是：**纯文字稿 → 纯图片稿 → 两者独立审核 → 源文件指纹锁定 → 才允许写公众号草稿 → 微信 `draft/get` 回读 → 最终预览审核**。只要审核后正文、图片、裁切、封面或 edition 清单发生任何变化，旧审核会自动失效，发布脚本直接拒绝写入微信，必须重新生成并审核。

今天 10 月 6 日这一版已经完整走完这套新流程：
- 纯文字稿、纯图片稿均已生成并审核通过；Nature Chemistry 今日精选和 Nature/Hyster 往期精选均锁定到具体 Git blob。
- 原先损坏的 Hyster 本地封面 JPEG 已彻底退出发布依赖；现在由 Nature 出版社原始反应图作为事实锚点，运行时生成无副标题的抽象 FRET 封面，并改为非 progressive JPEG。
- 公众号草稿更新成功：`draft_update`，`draft_readback=ok`，日报 29 篇、草稿包 2 篇文章均正确。
- 最终回读检查通过：16 张正文论证图/表完整，2 个封面缩略图和 1 个二维码正常，全部图片已经进入微信 CDN；旧损坏封面路径没有残留。外源 FRET、酶内 FRET、Lenacapavir、两篇 take-home、创作说明和原创说明均完整保留。

url查看这次公众号草稿回读预览https://relay.gczhouwld.com/wechat-preview/46996052560b30137c073a13.html

目前唯一记录下来的非阻断项是顶部“网页今日新增卡片”的 4 张可选 TOC 小缩略图没有返回，所以那里自动降级成了四张文字卡片；标题、DOI 和二维码都正常，今日精选正文图、封面和两篇深读完全不受影响。我没有为了这个次要展示项再重复覆盖已经审核通过的草稿。

以后公众号工作默认严格执行这套“**先分离、再审核、后合成、最后回读**”流程。
