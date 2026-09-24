Beijing time: 2026-09-24 19:17 +08:00
Context: Diagnose plain-link WeChat sharing and propose same-domain rich-card handoff

Reply body:

可以，而且我刚核对了现网，根因已经很明确。

现在之所以仍然经常显示“纯链接”，是因为上一轮为了彻底摆脱 `github.io` 和 `api.gczhouwld.com/share/... → github.io` 的双域名跳转，我把实际分享 URL 改成了：

`https://gallery.gczhouwld.com/?doi=...`

这个地址是 SPA 首页的 DOI 深链。浏览器打开后能正确定位论文，但微信在“生成聊天卡片”时首先读取的是页面初始 HTML，而这个入口没有每篇论文独立的 `og:title / og:description / og:image`。因此微信很容易把它降级成普通链接。

更合适的最终结构是继续坚持**单域名**，但在同一个 `gallery.gczhouwld.com` 下恢复“富卡片入口”：

`https://gallery.gczhouwld.com/share/<论文ID>.html`
→ 微信先读取该页的标题、期刊、日期、DOI、TOC 图片
→ 收件人点击卡片
→ 页面在约 0.5–1 秒内自动跳到
`https://gallery.gczhouwld.com/?doi=...`
→ 自动定位对应卡片并保持 20 秒高亮。

这样与之前最大的区别是：**分享页和最终网页都是 `gallery.gczhouwld.com`，没有跨域，也不再经过 api 子域或 github.io。**

而且基础设施其实已经基本存在。我刚实测现有：
`https://gallery.gczhouwld.com/share/MTAuMTAyMS9qYWNzLjZjMTUzOTM.html`
已经包含单篇论文的中文标题、JACS、日期、DOI 和 `og:image`。现在需要修的只有三处：

1. 卡片分享 URL 从 `/?doi=...` 改回同域名的 `/share/<id>.html`。
2. share 页中的 `og:url`、`og:image`、缩略图全部从 `api.gczhouwld.com` 改成 `gallery.gczhouwld.com`，真正做到单域名。
3. 去掉现在需要用户再点“进入文献库”的中间按钮模式，改成点击微信卡片后短暂停留/直接自动跳转到 DOI 深链。

目标微信卡片内容就是：
- 主标题：论文标题
- 描述：期刊 · 日期 · DOI
- 缩略图：该论文官方 TOC/Graphical Abstract
- 来源：Organic Synthesis Gallery
- 点击后：自动进入正式网页并定位、高亮论文。

还要区分一个微信本身的限制：**直接把 URL 复制粘贴到聊天框，微信不保证一定转换成图文卡片**；这由客户端风控/解析决定。最可靠的方式仍然是在微信内打开 Gallery，由 JS-SDK 配置好这篇论文，然后使用右上角“…”→“分享给朋友”。我们可以同时让“复制链接”也复制上述带 OG 信息的同域名 share URL，这样即使用户粘贴，至少具备被微信解析成富卡的完整条件。

这个方案不需要再买域名、不需要改 DNS，也不会重新引入刚刚解决掉的双域名问题。建议就按这个版本做。

Read-only verification:
- production src/card-share.ts currently shares gallery.gczhouwld.com/?doi=...
- per-paper /share/*.html pages already exist on gallery.gczhouwld.com
- verified sample share page contains per-paper title, description and og:image
- current share-page metadata still points og:url/og:image to api.gczhouwld.com
- no production code change made in this response
