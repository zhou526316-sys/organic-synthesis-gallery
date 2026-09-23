Beijing time: 2026-09-24 02:18 +08:00
Context: Fix shared-card recipient redirect to canonical GitHub Pages Gallery

Reply body:

对，问题已经定位并修掉了：之前“卡片页 → 最终网页”的目标地址写成了 `api.gczhouwld.com`，所以你点分享卡片后会先看到卡片页，然后立刻被送到那个你已经废弃的旧前端。

现在我已经改成：

`微信分享卡片页（api.gczhouwld.com/share/...）`
→
`https://zhou526316-sys.github.io/organic-synthesis-gallery/?doi=...&sharev=...`

也就是说，`api.gczhouwld.com` 以后只负责：
- 微信卡片元数据
- TOC 封面
- JS-SDK 签名/分享服务

真正给用户阅读的网页仍然是你指定的：

`https://zhou526316-sys.github.io/organic-synthesis-gallery/`

我还把之前错误地把 GitHub Pages 当成“旧网页”的隔离规则撤掉了；Cloudflare Pages fallback 才是备用入口。

这次修复提交：
`2485a7012c02c8a8f9683010c3d67a5c57172457`

而且我已经用你刚才这篇 DOI `10.1021/jacs.6c16346` 做了线上实测。现在它的分享页实际指向的是：

`https://zhou526316-sys.github.io/organic-synthesis-gallery/?doi=10.1021%2Fjacs.6c16346&sharev=2485a7012c02`

并且这个地址实际打开后仍停留在 GitHub Pages，不会再跳回 `api.gczhouwld.com`。

Worker 部署已经成功，Card sharing CI 也已经通过。

你现在最好重新生成并发送一次新的微信卡片再测。微信可能缓存已经发出去的旧卡片/旧跳转，新卡片会带新的 `sharev`，可以避开旧缓存。新卡片点进去后，目标应该就是你真正的“有机合成文献库”，然后定位并高亮对应文献。

Verification:
- Functional commit: 2485a7012c02c8a8f9683010c3d67a5c57172457
- Worker deploy 35901242914: success
- Card sharing CI 35901230709: success
- Live DOI 10.1021/jacs.6c16346 share page now links to GitHub Pages canonical deep link
- Canonical GitHub Pages deep link remains on github.io

Related main SHA at response sync:
- ea29530b479aee343788a6f0542c15ec7056806c
