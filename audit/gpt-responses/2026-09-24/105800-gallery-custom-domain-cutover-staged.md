Beijing time: 2026-09-24 10:58 +08:00
Context: Gallery custom-domain single-domain WeChat share cutover staged

Reply body:

我接上了。这里我没有直接把生产站切到 `gallery.gczhouwld.com`，而是先把整套切换做成了一个可验收的 **draft PR #200**，所以当前 `main` 和正式网页没有被提前改坏。

这条支线已经完成：卡片分享链接改成 `https://gallery.gczhouwld.com/?doi=...&sharev=...` 单域名直达；`github.io` 和旧 Cloudflare Pages 前端会在切换后统一转到新域名；微信 JS-SDK 签名后端仍留在 `api.gczhouwld.com`，但已经允许给 `gallery.gczhouwld.com` 页面签名；Worker CORS 已加入新域名；GitHub Pages 构建已加入 `public/CNAME`；Tampermonkey Bridge 的更新地址也准备切到新域名。旧的 `api.gczhouwld.com/share/*` 页面只保留作历史链接兼容，新分享不会再经过它。

验证方面，Card sharing CI #19、Cloudflare migration CI #419、Adaptive paired media batching #15、Publisher TOC adapter #182、作者/站点数据检查 #320 都已经通过。Site quality gate #365 中前端 build/typecheck、Worker dry-run、Production API smoke 也已经通过，目前只剩它自己的 Playwright interaction regression 还在运行。PR 仍保持 draft，没有合并。

你现在外部需要完成三件事：
1. Cloudflare DNS：`gallery` → CNAME `zhou526316-sys.github.io`，先保持 **DNS only / 灰云**。
2. GitHub：`organic-synthesis-gallery → Settings → Pages → Custom domain` 填 `gallery.gczhouwld.com`，等 HTTPS 证书生效。
3. 微信公众号后台：把 `gallery.gczhouwld.com` 加到 **JS接口安全域名**。验证文件 `public/MP_verify_UBgOE7Geixav7CCb.txt` 已经在仓库里，切换后会直接出现在新域名根目录。

这三项完成后直接告诉我 **“gallery 域名已配”**。我下一步就会做正式切换前验收：检查自定义域名/HTTPS、验证文件、JS-SDK 签名，再把 PR #200 从 draft 放行并合并部署，最后实测“微信卡片 → 新域名 → DOI 定位 → 20 秒高亮”，同时确认旧 `github.io` 和旧 Pages 入口只做迁移跳转，不再成为用户实际落地点。

Related branch:
- wechat/gallery-direct-share-20260924-1045
Related PR:
- #200
Related commit:
- 69bca856b942dcf1c670c3a01df961e52b5dd5f0
