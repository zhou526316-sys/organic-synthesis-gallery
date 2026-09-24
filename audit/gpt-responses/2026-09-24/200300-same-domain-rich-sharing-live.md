Beijing time: 2026-09-24 20:03 +08:00
Context: Same-domain rich sharing deployed to production

Reply body:

已经按你这个目标做成并上线了：**不要求“必须复制链接”这一种方式，而是统一做成“富卡片入口”**。别人先看到论文标题、期刊/日期/DOI 和 TOC 图片，点进去后自动进入你的 Gallery，并定位该论文、保持 20 秒高亮。

现在的分享结构是：

`gallery.gczhouwld.com/share/<论文ID>.html?sharev=...`
→ 这一步专门给微信/其他聊天软件读取富预览信息：
  - 论文标题
  - 期刊、日期、DOI
  - 官方 TOC / Graphical Abstract 图片
→ 对方点击后约 0.85 秒自动跳转到：
`gallery.gczhouwld.com/?doi=...`
→ 对应文献自动定位 + 20 秒高亮。

关键点是：**整个过程只使用 `gallery.gczhouwld.com` 一个域名**，没有重新引入 `api.gczhouwld.com → github.io` 的双跳。

我已经完成并验证：
- PR #220 已合并，生产提交 `d057cc6e27dca717a89174bbb547b92b49f63e11`。
- GitHub Pages #304：success。
- Card sharing CI #26：success，包括真正的分享按钮、富卡 URL、二维码、DOI 深链和高亮回归。
- Worker 前端同步 #85：success。
- 我又从公网直接读取了一篇真实分享页，已经确认 `og:title` 是论文标题、`og:description` 是 JACS + 日期 + DOI，`og:image` 已经变成 `https://gallery.gczhouwld.com/share-media/...png` 的 TOC 图片，不再引用 api 子域。

你现在有三种用法：
1. **微信内最稳**：打开 Gallery → 论文卡片“分享” → “准备微信图文卡片” → 微信右上角“…”→“分享给朋友”。这是最可靠的标题 + TOC 图文卡片。
2. **直接复制**：点“复制富卡链接”。复制的不再是普通 `/?doi=` 地址，而是带独立 OG 标题/TOC 的 `/share/...html`；支持链接预览的平台会尝试直接显示图文。
3. **系统分享**：手机的系统分享也改用同一个富卡入口，发到微信、QQ、短信等时，接收端只要支持网页预览，就能读取标题和图片。

你可以直接拿这篇做测试：
`https://gallery.gczhouwld.com/share/MTAuMTAyMS9qYWNzLjZjMTUzOTM.html`

这篇我已经核验过，当前能读到中文标题、JACS、日期、DOI 和真实 TOC 图。打开它会随后自动转到对应论文并高亮。

有一个边界要说明：如果某篇文章当前**还没有官方 TOC**，分享卡片会临时用 Gallery 默认图；等 TOC 被你的抓取链补齐并重新构建后，同一篇论文的富卡就会换成 TOC。微信是否把“手工粘贴 URL”即时展开成卡片仍由客户端决定，但现在链接本身已经具备完整的富预览条件；微信内用右上角分享则仍然是主通道。

另外，本次触发的 Cloudflare Pages fallback #76 在旧 Bridge 打包步骤失败，但**不影响正式 `gallery.gczhouwld.com`、GitHub Pages 或 Worker 分享链**；正式主链三项都已经成功。

Production evidence:
- PR #220 merged
- production commit: d057cc6e27dca717a89174bbb547b92b49f63e11
- GitHub Pages run #304 / 35996296257: success
- Card sharing CI #26 / 35996296261: success
- Sync frontend to Worker #85 / 35996296364: success
- Cloudflare Pages fallback #76 / 35996296233: failure in old Bridge packaging path; canonical Gallery unaffected
- external sample share metadata verified on gallery.gczhouwld.com
