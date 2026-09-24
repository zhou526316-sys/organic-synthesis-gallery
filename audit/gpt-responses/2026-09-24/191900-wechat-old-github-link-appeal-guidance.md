Beijing time: 2026-09-24 19:19 +08:00
Context: Guidance for WeChat appeal form on old github.io Gallery URL

Reply body:

这个页面是**申诉旧的 `github.io` 链接**，现在可以提交，而且建议这样填。

“申诉理由”直接粘贴下面这段，长度符合 10–200 字：

`该链接为本人维护的有机合成学术文献检索网站，仅展示公开论文信息、DOI、期刊及图文摘要，不含违规内容。此前 github.io 为共享域名，审核结果曾引用其他无关子站。现本站已绑定独立域名 gallery.gczhouwld.com，并启用 HTTPS，原链接已自动跳转至该独立域名，恳请按本站实际内容重新审核并恢复访问。`

“网站核心功能链接”建议填：

`https://gallery.gczhouwld.com/`

相关证明图片建议最多放 3–4 张：
1. 你刚才那张 GitHub Pages 截图：`DNS check successful` + `Enforce HTTPS`。
2. `gallery.gczhouwld.com` 正常打开文献库首页的截图。
3. 之前微信申诉结果中引用 `tsghsg.github.io` / `weruigyf.github.io`、并非你的子站的截图。
4. 如果还能放一张，可放浏览器中打开旧 `zhou526316-sys.github.io/organic-synthesis-gallery/` 后最终进入 `gallery.gczhouwld.com` 的截图。

我刚刚又实测了一次：旧 GitHub Pages 地址现在确实会落到 `gallery.gczhouwld.com`，所以这段申诉理由和当前实际状态是一致的。

不过从今后的使用角度，**不要再分享旧 github.io 地址**。新卡片和新入口都已经切到 `gallery.gczhouwld.com`；这次申诉主要是清理旧链接在微信里的历史封禁记录。

Current verified state:
- gallery.gczhouwld.com live over HTTPS
- old GitHub Pages URL redirects to gallery.gczhouwld.com
- production share flow already uses the custom domain
