Beijing time: 2026-09-24 00:19
Context: WeChat JS-SDK fixed-egress next step

Reply body:

微信后台的“白名单保存/通过”只是说明你刚才填的那个 IP 被接受了，但我重新实测后，Cloudflare Worker 下一次访问微信时出口已经换成了 `172.70.115.204`，微信再次返回 `40164 invalid ip not in whitelist`。所以不能再继续一个个追着 Cloudflare IP 加白名单，这条路不稳定。

你现在没有 VPS，最省事、成本最低的做法是买一台最小规格、带固定公网 IPv4 的云服务器，只让它做微信 `access_token/jsapi_ticket` 中转。主网站、TOC、正文图、Cloudflare 都不用搬。

我建议优先选 **腾讯云轻量应用服务器（香港或新加坡）**。原因是购买和付款对你更方便，而且轻量服务器有独立公网 IP；选香港/新加坡还能避免中国大陆网站备案这一层麻烦。配置不用高，Ubuntu 22.04/24.04，最低档就够了。腾讯云官方活动页当前也明确写有“免费独立公网 IP”。  
官方入口：<https://cloud.tencent.com/act/pro/lhsale>

如果腾讯云海外区不好买，第二选择是 **DigitalOcean 最低档 Droplet**，官方当前最低从 **$4/月**起，而且 Droplet 有稳定公网 IPv4；Reserved IP 绑定在 Droplet 上时也是免费的。  
官方价格：<https://www.digitalocean.com/pricing/droplets>  
Reserved IP：<https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/>

不建议现在用 Render/Railway 来绕：Railway 的固定出口 IP 属于 Pro 方案；Render 普通服务使用的是共享 CIDR 出口范围，不如一台最小 VPS 直接、便宜、可控。

我已经把固定出口中转程序写进你的主仓库了：

`ops/wechat-ticket-relay/`

所以你买服务器后不用开发新东西。你只需要把**公网 IPv4**发给我，**不要发服务器密码**。然后我会继续带你完成：

`公网 IP 加微信公众号白名单 → 部署 relay → 配置 relay.gczhouwld.com → Cloudflare Worker 改走 relay → 实测 access_token → jsapi_ticket → wx.config → 微信聊天图文卡片`。

如果你现在就准备买，我建议你直接选：**腾讯云轻量应用服务器 → 香港 → Ubuntu → 最低配置**。

Related commits:
- c7284429e4bb6f38c7876ce4ce6922d529ffa363 (fixed-egress relay support)
- f565f744fef8dbe98750d4731d722c4f5e14178e (current main)
