# PDF 授权仍卡住：与跨期刊美国 CI 成功的区别

北京时间：2026-10-08T17:17:24.378+08:00
项目：Organic Synthesis Gallery 架构续作；用户追问“那为什么我还是打不开”。
正式测试摘要：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/private-pdf/2026-10-08-cross-journal-reading-qa.json
此前用户实际错误：10.1021/acs.orglett.6c03725，authorize 阶段 15044ms，both-failed，未获得私有 PDF 签名 URL。
GitHub Actions 的 47 篇跨刊测试中 36 篇已存储样本在美国 runner 正常授权和阅读，11 篇未存储，未检出样本级服务器读取失败。测试不能代表用户中国网络。
主仓库 main 只读核对：
- src/private-pdf-reader.mjs OPEN_TOTAL_TIMEOUT_MS=15000，3.5s 后同一个 Cloudflare Worker 的备用 hostname。
- 请求 POST /api/user-ui/private-pdf/open 带 Authorization Header（会触发 CORS OPTIONS）；Gallery 静态域名与 API Worker 不同。
- Worker 的不授权/无存储等情况应返回明确 HTTP/JSON 响应，非必然网络 15s。
最新外部无认证检查：api.gczhouwld.com health ~1116ms、workers.dev health ~540ms，均健康；仍不是中国校园网。
没有用户私人 session token、局域网访问或边缘请求追踪，不能证明究竟是代理/DNS/CORS/preflight还是个别 session。不得将猜测冒充原因。
本轮未做生产修复、未改权限、未修改任务、未触发重新部署；反馈守住用户审批门禁。

## 已发送片段
**因为之前的 36 篇测试是在 GitHub Actions 的网络环境中完成的，而不是在你的 Edge 浏览器和校园网络中完成的。** 测试通过只能证明服务器具备正常授权、下载和显示 PDF 的能力，不能保证你所在的网络也能成功访问。

结合你此前的报错，有一个关键区别：

- **后台测试：** PDF 授权约 0.2–0.5 秒完成，文件正常读取。
- **你的浏览器：** 授权等待约 15 秒，显示 `authorize / both-failed`，尚未进入文件下载阶段。

因此，你之前打不开的直接原因是**浏览器未能在规定时间内获得有效授权响应**，而不是 PDF 文件损坏或 PDF.js 无法解析。

目前最可疑的是国内网络访问 Cloudflare Worker 的路径、Clash／学校 VPN 的代理规则，或者你当前账号的会话请求。两条授权域名实际上使用同一套 Cloudflare 后端，因此增加备用域名也不等于解决了国内网络问题。

但究竟是网络、代理还是账号，现有证据还不能定案。

## 后续最终回复
更具体地说，Gallery 页面能够打开，不代表 PDF 授权接口也能打开。页面和文献卡片由 `gallery.gczhouwld.com` 提供，而私有 PDF 需要你的浏览器跨域访问 `api.gczhouwld.com`，使用带 Authorization 的 POST 请求；浏览器还会先执行 CORS 预检。你此前的请求就是卡在这个授权阶段，根本还没开始传输 PDF。

刚才我又从外部独立核对了一次：正式 API 健康接口约 1.1 秒、备用 Worker 约 0.54 秒响应，两者均正常。这**不代表它们从你的校园网也可达**。

按当前证据，最值得优先排查的是 Edge/Clash/学校 VPN 对这两个 API 域名的分流、DNS 或连接问题。若单纯是账号没权限，服务端通常会较快返回 401/403，而不是两路都等待 15 秒；但仍不能完全排除个人会话异常。

**一个最省事的区分方法**：使用手机蜂窝数据（关闭 Wi-Fi），登录同一个 Gallery 账号打开同一篇已确认存储的 PDF，只告诉我“能打开”或“仍打不开”，无需截图、令牌或日志。若能打开，就优先修你电脑或校园网络的代理路由；若仍打不开，则进一步核查账号会话与中国境内的接入路径。

我不会把外部测试的“1 秒能打开”当成你的问题已解决，也不会在没有定位前继续盲目调整 PDF 下载代码。
