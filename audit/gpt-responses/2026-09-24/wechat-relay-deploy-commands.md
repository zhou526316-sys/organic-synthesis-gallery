Beijing time: 2026-09-24
Context: Continue WeChat relay deployment after fixed egress verification

Reply body:

已经确认：你的服务器固定公网出口就是 **43.135.32.73**。

你刚才输入的：

`TCP 22`
`TCP 80`
`TCP 443`

不是 Linux 命令，所以出现 `command not found` 是正常的。它们是要去 **腾讯云轻量服务器控制台 → 防火墙** 里添加的规则。你现在 SSH 已经能连上，说明 22 基本已经放行；再确认 80 和 443。

接下来按这个顺序做：

1. 微信公众号后台，把 **43.135.32.73** 加进 API IP 白名单。

2. Cloudflare DNS 里新增：
   - 类型：`A`
   - 名称：`relay`
   - IPv4：`43.135.32.73`
   - 代理状态：先选 **DNS only / 灰云**
   - TTL：Auto

   最终域名是：
   `relay.gczhouwld.com`

3. 腾讯云防火墙确认放行：
   - TCP 22
   - TCP 80
   - TCP 443

   **不要开放 8788。**

4. 回到你现在这个 SSH 窗口，依次复制执行：

```bash
sudo apt-get update
sudo apt-get install -y git
sudo git clone https://github.com/zhou526316-sys/organic-synthesis-gallery.git /opt/organic-synthesis-gallery
cd /opt/organic-synthesis-gallery/ops/wechat-ticket-relay
sudo ./install-ubuntu.sh
```

我已经把自动安装脚本放进仓库了，提交是：
`4254e009023248c531264004084df9a65ad38c12`

安装过程中它会提示：

`WeChat MP AppSecret:`

这时粘贴你的公众号 AppSecret。**输入时不会显示字符，这是正常的。不要把 AppSecret 发给我。**

这个脚本会自动：
- 安装 Docker、Nginx、Certbot；
- 生成一个随机 relay 密钥；
- 启动微信中转服务；
- 只监听本机 `127.0.0.1:8788`；
- 配好 Nginx 的 `relay.gczhouwld.com`。

5. 脚本跑完以后执行：

```bash
sudo certbot --nginx -d relay.gczhouwld.com --redirect --agree-tos --register-unsafely-without-email
curl https://relay.gczhouwld.com/health
```

如果成功，第二条应该返回类似：

```json
{"ok":true,"service":"osg-wechat-ticket-relay"}
```

6. 然后取出 relay 密钥：

```bash
sudo awk -F= '/^RELAY_SHARED_KEY=/{print substr($0,index($0,"=")+1)}' /etc/osg-wechat-relay/env
```

这个密钥**不要发给我**。直接复制到 GitHub 主仓库：

`zhou526316-sys/organic-synthesis-gallery`

`Settings → Secrets and variables → Actions → Repository secrets`

新增两个：

`WECHAT_TICKET_RELAY_URL`
值：
`https://relay.gczhouwld.com/wechat/jsapi-ticket`

`WECHAT_TICKET_RELAY_KEY`
值：
刚才服务器生成的那串 relay 密钥。

你现在先做到第 5 步。把 `curl https://relay.gczhouwld.com/health` 的输出贴给我即可；不要贴 AppSecret 或 relay 密钥。

Related commits:
- 4254e009023248c531264004084df9a65ad38c12
- 4254e009023248c531264004084df9a65ad38c12
