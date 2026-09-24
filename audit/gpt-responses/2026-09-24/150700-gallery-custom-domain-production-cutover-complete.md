Beijing time: 2026-09-24 15:07 +08:00
Context: Complete production cutover to gallery.gczhouwld.com and verify WeChat direct-share chain

Reply body:

已经切换完成了，而且我把正式链路也一起验收了。

现在生产状态是：

- `gallery.gczhouwld.com` 已经成为正式 Gallery 域名，HTTPS 正常。
- PR **#205** 已合并到 `main`，正式提交是 `c48a69af1a83ed14667848609e1ac4e278c34223`。
- GitHub Pages 正式部署 **run #294**：成功。
- Worker 前端/微信签名正式部署 **run #139**：成功。
- Card sharing CI **#23**：成功。
- 微信固定出口 relay：200，`jsapi_ticket` 正常。
- 微信 JS-SDK 已经实际为
  `https://gallery.gczhouwld.com/?doi=10.1021/jacs.6c15393`
  生成签名，返回 **HTTP 200 / ok=true**，AppID 也正确。
- `gallery.gczhouwld.com` 作为浏览器 Origin 的 Worker CORS 验证通过。
- 两个微信验证文件都已经在新域名根目录真实可访问。
- DOI 深链接已经实测能直接打开并找到对应文献卡片。
- 旧地址
  `zhou526316-sys.github.io/organic-synthesis-gallery/?doi=...`
  已实测会转到
  `gallery.gczhouwld.com/?doi=...`，所以旧 GitHub Pages 地址现在只是迁移入口。
- 新生成的分享链接已经不再走
  `api.gczhouwld.com/share/... → github.io`
  双跳，而是直接：
  `https://gallery.gczhouwld.com/?doi=...`

所以你截图里微信那个“部署验证文件”页面，如果还没点，现在可以直接点 **“已部署，开始验证”**。

然后做最后一个真实微信测试：在微信里打开 `gallery.gczhouwld.com`，找一篇有 TOC 的文献，点卡片里的“分享”，再用微信右上角 **“…” → “分享给朋友”**。目标结果应该是：聊天里出现文献图文卡片，点进去直接到 `gallery.gczhouwld.com` 对应 DOI，并保持 20 秒高亮，不再经过 `github.io`。

另外，如果你在 GitHub Actions 里看到少数红色任务，不代表这次切换失败。现在还有几条**旧 Cloudflare Pages 备用链路**自身有历史问题：一个是旧 fallback Bridge 的打包断言，另一个是 Cloudflare Pages API token 权限报 `10000`，还有一条旧 Worker additions 的 secret/version `10215`。它们都不是当前主站链路；现在真正使用的 **GitHub Pages + gallery 自定义域名 + Worker API/微信签名** 已全部通过。我建议下一批再把这些旧备用链路清干净，避免以后看 Actions 时混淆。

Verification:
- PR #205 merged
- merge commit: c48a69af1a83ed14667848609e1ac4e278c34223
- GitHub Pages run #294: success
- Worker frontend run #139: success
- Card sharing CI #23: success
- production WeChat JS-SDK signature for gallery.gczhouwld.com: HTTP 200, ok=true
- old github.io DOI URL redirects to gallery.gczhouwld.com
- both WeChat verification TXT files live on gallery.gczhouwld.com
