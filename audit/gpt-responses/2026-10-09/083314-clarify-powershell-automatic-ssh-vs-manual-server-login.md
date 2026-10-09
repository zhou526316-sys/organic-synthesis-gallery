# 用户咨询：是否需要先 SSH 登录云服务器

北京时间：2026-10-09T08:33:14.838+08:00
项目：Organic Synthesis Gallery，腾讯云 owner-private PDF 网关（零新增费用）部署准备。
用户原话：“我还没有进云服务器吧，是否得先给代码我进去？”

## 本轮完整可见答复

**你现在仍在本地 Windows PowerShell（提示符是 `PS C:\Users\asus>`），尚未进入腾讯云服务器。**

不过，**运行我刚才提供的 `run-from-windows.ps1 -Mode Preflight` 脚本时，不需要提前手动登录**。该脚本会自动通过 SSH 连接服务器，并按需要提示身份验证。

如果你想**先手动登录服务器**，就在当前 Windows PowerShell 输入：

```powershell
ssh -p 22 ubuntu@relay.gczhouwld.com
```

这也等价于连接此前确认的腾讯云公网 IPv4 `43.135.32.73`。首次连接时需先在腾讯云控制台核对 SSH 主机指纹，确认后才输入 `yes`；然后使用原有密码或 SSH 密钥登录。密码输入时不会显示字符，这是正常现象。

登录成功后，提示符通常会变成：

```text
ubuntu@VM-0-11-ubuntu:~$
```

**注意两种终端的分工：** `ssh` 登录后运行的是 Ubuntu/Linux 命令；我给你的以 `$src`、`Invoke-WebRequest`、`powershell.exe` 开头的预检脚本需要在**本地 Windows PowerShell** 运行。因此，若想执行那段自动预检，先在 Ubuntu 终端输入：

```bash
exit
```

回到 `PS C:\Users\asus>`，再执行刚才的修复版预检命令。你也可以完全跳过手动登录，直接运行预检脚本，它会自行使用 SSH。

**建议直接采用自动预检，避免重复登录。** 预检不会安装服务、改动 Nginx 或影响公众号。后续安装须等 DNS、证书和安全检查通过；正式 PDF 备用线路目前仍未启用。

## 合规说明

本回复仅说明用户端 SSH/Windows PowerShell 的使用方式；未新增服务器、付费项目或生产配置变更，未连接用户主机，也未改变现有公众号或发布工作流。
