# PDF Gateway Preflight — SSH login prompt clarification

Beijing time 2026-10-09T08:39:20.103+08:00
Task: user asked why automatic PowerShell preflight transitioned to login. Known launcher performs ssh.exe mkdir, 2 scp uploads, ssh.exe sudo preflight, requiring existing SSH credentials on each new SSH connection; not credential bypass or website sign-in.

## Full user-visible reply

这是正常的。**脚本会自动发起 SSH 连接，但腾讯云服务器仍然需要验证你的登录身份。**“自动连接”并不代表可以跳过服务器密码。

如果 PowerShell 显示：

```text
ubuntu@relay.gczhouwld.com's password:
```

请输入**腾讯云 Ubuntu 服务器的登录密码**，不是 Windows 开机密码。

注意：输入密码时屏幕不会显示任何字符或星号，输入完成后直接按 Enter。

这个预检脚本需要建立多次 SSH/SCP 连接，因此可能重复要求输入密码。之后若出现：

```text
[sudo] password for ubuntu:
```

通常也是输入该 Ubuntu 用户的密码。

**目前仍处于服务器身份验证阶段，还没有部署 PDF 网关。**

如果出现的并不是上述密码提示，而是网页登录页、`Permission denied` 或其他提示，请把屏幕上的**具体文字或截图（遮住任何凭据）**发给我，我会判断是哪一步，不用反复尝试密码。

No production code changes, credentials accessed, new paid services, or SSH operation were performed by assistant.