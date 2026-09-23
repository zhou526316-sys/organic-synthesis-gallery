Beijing time: 2026-09-24
Context: First SSH login and fixed-egress verification

Reply body:

现在先不要继续改服务器内部配置，先完成“固定公网 IP + SSH 登录”这一步，确认 `43.135.32.73` 真的是这台机器的出口 IP。

先在微信公众号后台把 **`43.135.32.73` 加进 API IP 白名单**。之前为了 Cloudflare 加的 `172.*` 地址后面可以删掉。

然后在你的 Windows PowerShell 里运行：

```powershell
ssh ubuntu@43.135.32.73
```

第一次连接如果出现：

```text
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

输入：

```text
yes
```

然后输入你刚设置的服务器密码。注意：**输入密码时屏幕不会显示星号，也不会显示字符，这是正常的**，输完直接按 Enter。

登录成功后，先只执行下面三条：

```bash
whoami
hostname
curl -4 https://api.ipify.org ; echo
```

正常情况下应该看到：

- `whoami` → `ubuntu`
- 最后一行公网 IP → **`43.135.32.73`**

如果 `curl` 返回的也是 `43.135.32.73`，就说明我们的固定出口条件成立。

腾讯云控制台的防火墙这一步也确认一下，只需要放行：

```text
TCP 22
TCP 80
TCP 443
```

**不要开放 8788**，relay 的内部端口以后只让反向代理访问。

你现在做到这里，把这三条命令的输出贴给我即可；**不要发服务器密码，不要发公众号 AppSecret**。确认出口 IP 后，我下一步直接给你复制粘贴式命令部署 `osg-wechat-ticket-relay`。

Related commit:
- 289ade16d500644bb0447cf2c28c498f599f0326
