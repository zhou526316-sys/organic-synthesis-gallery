Beijing time: 2026-09-24 00:xx
Context: Choose Tencent Cloud Lighthouse image for WeChat fixed-egress relay

Reply body:

这里不要选你截图里这些“应用镜像”。

最稳妥的选择是：

1. 顶部切到 **“基于操作系统镜像”**。
2. 地域不要用现在的 **上海**，改成 **中国香港**；如果香港没有合适套餐，就选 **新加坡**。
3. 操作系统选 **Ubuntu 22.04 LTS**；如果只有 Ubuntu 24.04 LTS，也可以。
4. 配置选最低档即可，1 核/1G 或 2 核/2G 都完全够用。
5. 要确认套餐包含 **独立公网 IPv4**。

原因是这台机器只做微信 `access_token/jsapi_ticket` 固定出口中转，不跑你的主网站，不需要 WordPress、宝塔、Node.js 应用镜像、Hermes、Docker 面板这些额外组件。

如果你更想少装一步，也可以选你截图里的 **Docker CE**，因为我已经给 relay 写好了 Dockerfile；但我仍更建议 **Ubuntu 22.04 LTS 干净系统**，后面我给你的命令更可控，也更容易排错。

你下一步切到“基于操作系统镜像”后，把那一页截图发我，我直接告诉你具体点哪一个。

Related commit:
- 52c2eeb37436cacae335856c67997fcaa22ed291
