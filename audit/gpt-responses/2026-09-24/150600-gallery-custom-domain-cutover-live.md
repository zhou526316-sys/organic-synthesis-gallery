Beijing time: 2026-09-24 15:06 +08:00
Context: Gallery custom-domain cutover completed and production verified

Reply body:

继续完成了，正式切换已经上线。

当前状态：
- PR #205 已合并到 main，merge commit：`c48a69af1a83ed14667848609e1ac4e278c34223`。
- GitHub Pages 正式部署 run #294（`35967458578`）成功。
- Worker 正式部署 run #139（`35967467287`）成功。
- Card sharing CI run #23（`35967458605`）成功，包含 canonical routing 与 Playwright 卡片分享/DOI 深链回归。
- Worker 部署中的固定出口 relay、`gallery.gczhouwld.com` JS-SDK 签名、Gallery-origin CORS 检查全部成功。
- 外部实测 `https://gallery.gczhouwld.com/` 已可通过 HTTPS 正常访问。
- 外部实测旧入口 `https://zhou526316-sys.github.io/organic-synthesis-gallery/?doi=10.1021/jacs.6c15393` 最终会落到 `https://gallery.gczhouwld.com/?doi=10.1021/jacs.6c15393`，旧 github.io 已不再作为最终落地点。
- 两个微信验证 TXT 文件均已从新域名根目录公开可访问。

生产分享链现在已经变成：
`gallery.gczhouwld.com/?doi=... → 对应文献卡片 → 20 秒高亮`

新生成的分享不再经过 `api.gczhouwld.com/share/... → github.io` 的双域名链路；`api.gczhouwld.com` 只保留后台 JS-SDK 签名/API，`relay.gczhouwld.com` 继续只做固定出口。

现在只剩一个微信后台的人机确认步骤：回到你刚才截图的“部署验证文件”页面，点 **“已部署，开始验证”**。文件已经真实在线，所以现在可以点。如果微信显示验证成功，这条自定义域名分享链就完成最后一环。若验证失败，把结果截图发我，我直接继续查，不要改 DNS，也不要把 Cloudflare CNAME 改成橙云。

Production evidence:
- PR #205 merged
- merge commit: c48a69af1a83ed14667848609e1ac4e278c34223
- GitHub Pages run: 35967458578 success
- Worker run: 35967467287 success
- Card sharing CI run: 35967458605 success
- legacy GitHub Pages URL externally resolves to gallery.gczhouwld.com
