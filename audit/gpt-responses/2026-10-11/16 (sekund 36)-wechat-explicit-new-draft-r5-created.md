# User-visible reply · New WeChat cloud draft created on explicit authorization

Beijing time: 2026-10-11 16 (sekund: 36)
Task: user said "你再建一份新的不就行了", explicitly overriding old same-media-only default for this named Oct11 pair. Source verified Oct11 R5, preserved original.
New distinct media_id: KhELYUzvwADwB_l1xH1SWDDwVx5ED70Hc4618UW3hFa5y091yX1hRRYLDP41XEXa
Original untouched media_id: KhELYUzvwADwB_l1xH1SWOG4MGfh55oHCc7llEvIMhvXq9BhWLWVfRRRPx3yKyH7
First run: 38123439181; WeChat draft/add succeeded; first content byte mismatch raised because WeChat normalized HTML; the new id was already persisted.
Second run: 38123546886; resumed already-created media_id, no another draft/add, semantic scientific text/images/source-link exact check pass, full official draft/get pass, original source unchanged.
New real preview: https://relay.gczhouwld.com/wechat-preview/8189151aedc49f115131ce8b.html
Original preview: https://relay.gczhouwld.com/wechat-preview/0c6a5b8965d6401973a288b4.html
Two real-preview titles/DOI links/image counts match. 32 body evidence figures + 2 covers + QR. No public send. Local Android app refreshing pending actual observation.
QA record: audit/wechat-working/2026-10-11-new-draft-mobile-sync-recovery.json commit b43174025b16e2b6a5696a697f39986d58595d71.
Code: ops/wechat-publisher/create-draft.py user explicit clone, pin source HMAC, requestID idempotency, copy original stored html/cover media ids, accept only safe HTML normalization, preserve original, verify second cloud draft, no publish.
Workflow: original sources + immutable host screenshot QA preserved; latest receipt now references new ID.
## Complete visible final
**已经新建了一份独立的 10 月 11 日双篇公众号草稿。** 这次使用微信 `draft/add`，取得了新的 `media_id`，不是再覆盖原草稿。

[打开新草稿的真实预览](https://relay.gczhouwld.com/wechat-preview/8189151aedc49f115131ce8b.html)

我已通过微信 `draft/get` 和新旧预览对比确认：今日精选 JACS、往期精选 Nature Synthesis 的标题、顺序、正文、32 张原文证据图、两张封面、二维码和两条 DOI 精准跳转链接均保留，内容与之前验收的 R5 一致。**旧草稿没有删除或修改，也没有群发。**

首次新建后，微信将部分 HTML 格式自动规范化，严格的字节比较因此中止验收；随后我复用了已经创建的新草稿 ID，按正文文字、图片顺序、链接和标题结构重新核对，通过后才标记完成。**没有因此再建第三份。**

[查看新草稿保存和回读成功记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38123546886)

现在在手机「公众号助手」的草稿箱中**向下刷新**，找更新时间约为 **今天 16:03–16:05** 的新双篇草稿。它与旧草稿是两条独立记录。旧草稿上的“保存异常／本地副本”警告可能不会因为新建而自动消失，但可以先使用新的云端草稿；**确认手机端新稿正常显示前，不要删除旧稿或清除应用数据**。

云端新建与回读已完成；手机端是否已显示新稿，仍以你实际打开的结果为准。
