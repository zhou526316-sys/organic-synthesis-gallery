Beijing time: 2026-09-24 10:41 +08:00
Context: WeChat appeal rejection confirms github.io shared-domain risk

Reply body:

这张图基本把根因坐实了。至少从你收到的两份审核通知看，微信是按 **`github.io` 这个共享域名维度** 给出审核结果的，而且引用的违规链接分别是 `tsghsg.github.io`、`weruigyf.github.io`，都不是你的 `zhou526316-sys.github.io`。也就是说，你继续申诉自己的 GitHub Pages 子站，很容易继续被 `github.io` 这个共享父域拖累。

所以这条路不要再继续硬申诉了。更合理的处理是：

1. **GitHub Pages 继续作为真正的网站托管平台**，内容完全不搬。
2. 给它绑定你自己的公开域名：`gallery.gczhouwld.com`。
3. 微信以后只看到 `gallery.gczhouwld.com`，不再看到 `github.io`。
4. 分享卡片直接指向：
   `https://gallery.gczhouwld.com/?doi=...`
   不再经过 `api.gczhouwld.com/share/... → github.io` 的两段跳转。
5. `api.gczhouwld.com` 只留作后台 JS-SDK 签名/API，用户看不到它；`relay.gczhouwld.com` 只负责微信固定 IP 中转。

GitHub 官方支持给 Pages 项目绑定自定义子域名；对子域名，只需要在仓库 Pages 设置里填自定义域名，并把 DNS 的 CNAME 指向 `zhou526316-sys.github.io`，不是指向仓库路径。citeturn262579search0turn262579search1

你现在做两步就行：

- GitHub：`organic-synthesis-gallery → Settings → Pages → Custom domain` 填 `gallery.gczhouwld.com`
- Cloudflare DNS：新增 `CNAME`，名称 `gallery`，目标 `zhou526316-sys.github.io`，先设为 **DNS only / 灰云**

这样之后，我会把分享链改成 **单域名直达**：微信聊天里的图文卡片点一下就直接进入 `gallery.gczhouwld.com` 的对应文献并高亮 20 秒，中间介绍页也可以直接取消。

这比继续申诉 `github.io` 有意义得多。

Related main SHA:
- ef4550778c0d40513fc038d2d249bc4c7067b586
