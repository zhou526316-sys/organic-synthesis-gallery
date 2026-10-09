# Gallery PDF native browser and Range recovery — response synchronization

Beijing time: 2026-10-09 23:15:10
Project chat context: User approved two verified repairs for persistent slow/unreadable private PDFs.
PR: #455 merged as bc9c607056f0244ff85ffa5641c5c440f98a8cae.
Production: Worker #37948599826 success; Pages #37948599914 success; Vault live #37950011372 success / 13 resources.
No signed URLs, private bearer tokens, real PDFs or personal emails copied into Git.
Owner-campus authenticated acceptance not performed.
Related machine audit: audit/pdf-reader/2026-10-09-pr455-production-live-verification-final.json.

## Previously sent user-visible partials

我检查了当前正式版代码，发现一个重要问题：

**“浏览器阅读”并不是独立的 PDF 备用线路。** 点击后，页面重新取得临时授权链接，再直接跳转到同一个 Cloudflare PDF 文件接口。它没有避开国内网络较慢或不稳定的传输链路。

而且，浏览器原生阅读器接管后，如果后续请求遇到授权过期、会话失效或网络错误，Gallery 原来的错误提示和重试按钮便无法继续工作。这是现有架构的一个明确不足，可能解释部分“浏览器阅读打不开”的情况，但还需要真实失败请求来确认。

此前修复的“第一页优先读取”只作用于网页内 PDF.js 阅读器，**没有解决浏览器原生模式的上述问题**。

另一个更直接的缺陷也已确认：**现有主备线路切换主要发生在获取 PDF 授权时，而不是文件传输失败时。**

当前代码在 PDF 分段请求超时或返回服务器错误时，通常只会重试同一个文件地址；只有授权票据返回 401 等特定情况才会重新获取地址。因此，即使另一条 Cloudflare 线路可能更快，阅读器也未必会切换过去。

结合你此前截图中约 92 秒的文件传输超时，这个缺口应当作为优先修复项，而不只是继续缩短超时时间。

专项回归已通过：在线私有 PDF 浏览器测试 **39/39**，本地 PDF 阅读器测试 **23/23**。

新增测试验证了主线 503 重新授权并从备用线路继续读取、强哈希不一致拒绝、403 拒绝绕过、浏览器预检 503 保留重试页面、原生链接使用新标签页并保留原阅读标签页。

https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37948053477

这些仍是隔离 Chromium 模拟，尚非真实中国网络 Edge 验收。

## Final user-visible continuation

**这两项修复已经合并并正式上线。** [PR #455](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/455) 已合入 `main`；[Worker 部署 #37948599826](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37948599826)、[Pages 部署 #37948599914](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37948599914) 和 [PDF Vault 线上资源校验 #37950011372](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37950011372) 均成功，后者确认了本次版本的 13 个静态资源。

新版网页内 PDF.js 阅读器在文件分段遇到可恢复的超时或 5xx 故障时，可以通过另一条已授权的 Worker 线路重取；只有 **PDF 内容哈希与文件大小一致**才允许继续。账号无权读取、返回 403 或文件不一致时不会绕过限制。“浏览器阅读”现在先做真实 206 分段预检，并在新标签页打开，原来的 Gallery 标签页仍保留供失败后重试。

现在建议你在 Edge 中对 Gallery 页面按 **Ctrl+F5** 强制刷新，再打开一篇之前很慢的 PDF，分别试网页内阅读和“浏览器阅读”。

**尚未宣称国内网络问题已经全部解决**：当前两条传输线路仍属 Cloudflare，腾讯独立线路还缺正式 HTTPS 验收；我也无法在没有你登录会话的情况下替你完成真实校园网 PDF 加载测试。若仍然慢，请发一篇出问题的 **DOI、使用的网络（校园网/手机热点）以及错误页的阶段和耗时截图**，不要发送登录令牌或带 `token=` 的 PDF 链接。
