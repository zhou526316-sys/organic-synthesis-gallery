Beijing time: 2026-09-24 19:25 +08:00
Context: WeChat appeal submitted and waiting for manual review

Reply body:

这个状态就对了：**申请已经正式提交成功，进入微信人工核实阶段**。页面明确写的是“3 个工作日内核实处理，并通过‘微信团队’服务号通知结果”。

这几天先不要再动这条链路。我会保持现有配置不变：
- `gallery.gczhouwld.com` 继续作为正式域名；
- Cloudflare 的 `gallery` CNAME 继续保持 **DNS only / 灰云**；
- GitHub Pages 的 Custom domain 和 Enforce HTTPS 不改；
- 刚部署的微信验证 TXT 文件继续保留在网站根目录；
- 新分享继续使用 `https://gallery.gczhouwld.com/?doi=...`，不再使用旧 `github.io` 作为分享入口。

现在你只需要等“微信团队”的审核结果即可。**不要重复提交、不要删除验证文件、不要重新申诉同一链接。**

等审核结果出来后，把“微信团队”的通知截图发给我。通过的话我就继续做最终微信分享实测；如果不通过，我会根据它给出的具体违规域名/条款继续定位。
