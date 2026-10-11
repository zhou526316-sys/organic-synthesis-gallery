# October 11 WeChat R3 – Same-Media Verified Draft Update

Beijing time: 2026-10-11 13:50:27 +08:00
Context: user approved complete R3 update of both Oct11 WeChat articles with owner-selected retrospective cover, restored SI apparatus image, complete logical source figures and evidence-led Chinese prose.

Approved scope: draft only; no mass send. Same media_id confirmed on WeChat draft/get.
Selection: JACS DOI 10.1021/jacs.6c15886; Nature Synthesis DOI 10.1038/s44160-026-01127-z.
Source import run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38115799397
Publisher run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38115946464
Latest real preview: https://relay.gczhouwld.com/wechat-preview/31f4c0657f2326b551ab0faa.html
Publisher stage: draft_update, draft_readback=ok, publish_id=null.
Independent real relay preview: two articles, full titles, 35 images (32 body+2 covers+QR), exact DOI links, Fig4abc/de/fg and SI Fig39 present.
Code safety commits: master rule 055e4e2c786a8ce2ab4cee93ac3f41e0a59228c6; R3 pinned import workflow 0b1d6d1ef4a3fcf82f081d44577743eb290f78f5; exact owner cover publisher 3a0a41b0af8907ac7c35e06b38325add8fb4bd9a; strict-media-id fail closed 22a898498e004ff7d530fa2f703e4314dd721e72.
Final QA: audit/wechat-working/2026-10-11-r3-real-draft-qa.json commit 2ff38d91c70bdc66cfec0c9be9a89d3f6c32f7d7.
Native WeChat mobile card screenshot not obtained, so unverified explicitly.

## User-visible answer

**10 月 11 日微信公众号 R3 双篇草稿已修改完成，且已经真正保存到微信后台。**

[打开 R3 真实微信草稿预览](https://relay.gczhouwld.com/wechat-preview/31f4c0657f2326b551ab0faa.html)

这次复用了原草稿 `media_id`，没有创建重复草稿。正式运行返回 `draft_update` 成功、`draft/get=ok`，并且 `publish_id=null`，**没有群发**。

两篇文章按现行长期主规范重新处理：今日精选 JACS 保留最大化的原文 TOC 和完整日报式标题；往期精选 Nature Synthesis 已换成**你刚指定的蓝色概念图**。原图已单独归档；为满足微信图片上传大小要求，实际采用逐像素一致的无损压缩 PNG，未重新生成或改变化学画面。

正文也已完成一轮有证据约束的修订。主要修复了 JACS Scheme 3 上下两组被截断的底物图、Nature Synthesis Fig. 2 和 Fig. 4 的不完整拆图，并补回了 Supplementary Fig. 39 的流动反应装置图。图文按论证位置重新绑定；特别对自由基捕获比例、区域选择性、能量转移、计算速率与工作机理的证据等级进行了区分，避免把计算结果写成实测结论。

**最终回读验收：**两篇文章顺序及完整标题正确，正文共 **32 张原文证据图**，另有两张封面和一个 Gallery 二维码，实际预览包含 **35 个微信图片资源**。两篇“阅读原文”仍准确指向各自 DOI 文献卡片，附带 `summary=0`，不会自动弹出摘要。

[查看成功执行记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38115946464) · [下载 R3 完整文字与图片审核包](sandbox:/mnt/data/wechat_2026-10-11_r3_scientific_reviewed_package.zip)

微信后台保存与网页草稿预览均已核验；**微信手机客户端原生卡片的最终裁切与标题叠加尚未取得实机截图**，这一项不冒称已实机验收。已将项目现有微信公众号 API 密钥及固定 IP 写稿链路的使用规则写入长期主规范（不在文档中泄露密钥内容）。
