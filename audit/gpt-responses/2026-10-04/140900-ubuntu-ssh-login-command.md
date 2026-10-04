Beijing time: 2026-10-04 14:09 +08:00
Context: User asks for the command to log into the Ubuntu server used by relay.gczhouwld.com.

User-visible reply:
你在 Windows PowerShell 里直接输入：

```powershell
ssh ubuntu@relay.gczhouwld.com
```

第一次连接如果看到：

```text
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

输入：

```text
yes
```

然后根据你这台服务器原来的登录方式输入密码，或让 SSH 自动使用已有密钥。

如果你之前是用指定私钥登录，则用：

```powershell
ssh -i "C:\你的密钥路径\xxx.pem" ubuntu@relay.gczhouwld.com
```

成功后命令行前缀通常会变成类似：

```text
ubuntu@VM-0:~$
```

看到这个就说明已经进入 Ubuntu。接着再执行我上一条里的：

```bash
curl -fsS https://relay.gczhouwld.com/health && echo
```

如果 `ssh ubuntu@relay.gczhouwld.com` 报错，把完整报错贴给我，我再按实际错误继续。