Beijing time: 2026-09-24 00:xx
Context: Post-purchase setup for WeChat fixed-egress relay

Reply body:

买好以后不用搬网站，也不用把服务器密码给我。这台服务器只负责一个很小的功能：用固定公网 IPv4 向微信换取 `access_token/jsapi_ticket`。

接下来按这个顺序做：

1. 在腾讯云轻量服务器控制台找到这台机器的 **地域** 和 **公网 IPv4**。如果你买的是香港/新加坡，可以直接继续；如果最后买成了上海/广州，先告诉我，因为域名接入会多一层备案因素。
2. 把这个公网 IPv4 加到微信公众号的 **API IP 白名单**。之前加的 Cloudflare IP 可以以后删掉。
3. 服务器防火墙/安全组只开放 **22、80、443**；不要把 relay 的内部端口 8788 直接暴露公网。
4. 在 Cloudflare DNS 新增一条：
   `relay.gczhouwld.com → 你的服务器公网 IPv4`
   初次配置先用 **DNS only / 灰云**，这样 HTTPS 证书最容易自动签发。
5. 我们在服务器里部署仓库现成的 `ops/wechat-ticket-relay/`。它已经包含 Node 服务和 Dockerfile。部署后会由 Caddy/Nginx 把：
   `https://relay.gczhouwld.com/wechat/jsapi-ticket`
   转到本机 `127.0.0.1:8788`。
6. 服务器里只保存三个敏感值：公众号 AppID、AppSecret、一个随机 relay 密钥。AppSecret 不要发到聊天里；relay 密钥也不要发给我。
7. 在 GitHub 主仓库的 Repository secrets 再加两个值：
   `WECHAT_TICKET_RELAY_URL=https://relay.gczhouwld.com/wechat/jsapi-ticket`
   `WECHAT_TICKET_RELAY_KEY=服务器上生成的同一个 relay 密钥`
8. 然后我触发重新部署并依次验收：
   `固定IP → access_token → jsapi_ticket → JS-SDK 签名 → wx.config → 微信聊天图文卡片`。

你现在先只做第一步：**把腾讯云控制台里显示的“地域 + 公网 IPv4”发给我**。不要发服务器登录密码，也不要发 AppSecret。拿到这两个信息后，我直接给你下一步需要复制粘贴的服务器命令。

Related commit:
- 738d4b627b84a23c0127fe09aafa3e61ddc4bc6b
