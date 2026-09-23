Beijing time: 2026-09-24 07:53 +08:00
Context: Diagnose double WeChat external-link warning and propose single-domain GitHub Pages architecture

Reply body:

这两张截图已经把问题确认了：现在不是一个单纯的“停留时间太短”问题，而是当前分享链路有两次微信外链安全校验。

第一段是 `api.gczhouwld.com/share/...`，微信先把它当“非微信官方网页”；继续后又跳到真正的文献库 `zhou526316-sys.github.io/organic-synthesis-gallery/`，第二个域名又可能再触发一次。这个两段式架构不适合最终用户。

我已经先把最明显的问题改掉了：**介绍卡片现在不再 120 ms 自动跳走**。它会一直停留，只有用户自己点击“进入有机合成文献库并定位这篇文献”才进入正文。对应提交是 `8b6d8bc4fbdcff623c4c981c9d499e6124f72c37`，正在部署。

但要真正解决“都是链接形式 + 每一层都要申请访问”，不能继续让用户在 `api.gczhouwld.com → github.io` 两个域名之间跳。最合理的最终结构是：

`gallery.gczhouwld.com` = 你的 GitHub Pages 正式文献库
`api.gczhouwld.com` = 只做后台 API / 微信签名
`relay.gczhouwld.com` = 只做固定 IP 的微信 ticket relay

也就是说，**网站本身仍然由 GitHub Pages 托管，内容完全就是你现在这个“有机合成文献库”，只是给它绑定一个你自己的公开域名 `gallery.gczhouwld.com`**。GitHub 官方支持给 Pages 项目绑定自定义子域名，DNS 只需要把 `gallery` CNAME 到 `zhou526316-sys.github.io`。citeturn162328search0turn162328search1

这么做后，我们就能把微信分享卡片、点击落地页、20 秒定位高亮全部统一成：

`https://gallery.gczhouwld.com/?doi=...`

而不是再经过 `api.gczhouwld.com/share/...` 再跳一次。这样至少可以彻底消除“两个外链域名、两次确认”的结构性问题。

另外要说明：你截图里的“非微信官方网页 / 申请恢复访问”属于微信自己的外链风控，不是 JS-SDK 签名失败。即使我们把域名、公众号业务域名和 JS 接口安全域名都配置正确，微信是否完全取消这个提示仍由它的安全策略决定；但用你自己的单一域名，比现在 `api 子域名 + github.io` 双跳更合理，也更容易做域名归属和恢复访问。

如果你坚持地址栏必须一直显示原始 `zhou526316-sys.github.io/organic-synthesis-gallery/`，那就很难同时解决微信对 `github.io` 共享域名的安全提示。**想保留同一个 GitHub Pages 网站内容，又把微信体验做好，绑定 `gallery.gczhouwld.com` 是更合适的方案。**

下一步你只需要做两个设置：
1. GitHub 仓库 `zhou526316-sys/organic-synthesis-gallery → Settings → Pages → Custom domain` 填 `gallery.gczhouwld.com`。
2. Cloudflare DNS 新增 `CNAME`：`gallery → zhou526316-sys.github.io`，先设为 DNS only。

做完告诉我“gallery 域名已配”，我就把分享页、JS-SDK、微信卡片链接和 DOI 高亮入口全部切到这个单一域名。

Related commits:
- 8b6d8bc4fbdcff623c4c981c9d499e6124f72c37
- 8b6d8bc4fbdcff623c4c981c9d499e6124f72c37
