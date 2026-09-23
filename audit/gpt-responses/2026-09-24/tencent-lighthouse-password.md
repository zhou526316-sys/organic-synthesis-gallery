Beijing time: 2026-09-24
Context: How to get/set Tencent Cloud Lighthouse server password

Reply body:

如果你买的是腾讯云轻量应用服务器并选了 Ubuntu/Linux，通常不是“查看系统自动生成的密码”，而是创建完成后自己重置一个登录密码。

在腾讯云控制台进入：轻量应用服务器 → 服务器 → 找到这台实例 → 右上角“重置密码”（或者“更多 → 重置密码”）。

如果你选的是 Ubuntu：
- 默认登录用户名是 `ubuntu`
- Ubuntu 默认不开放 root 密码登录
- 直接给 `ubuntu` 用户重置密码即可
- 后续登录后用 `sudo` 执行管理员命令

如果是其他 Linux 镜像，默认用户名通常是 `root`。

腾讯云官方目前说明：Linux 轻量服务器创建后需要通过“重置密码”设置登录密码；Windows 如果选“自动生成密码”，才会通过站内信/邮件发送初始密码。

重置好以后，不要把服务器密码发给我。你只需要告诉我“密码已设好”，我下一步给你一条 SSH 登录命令和部署 relay 的命令。

Related commit:
- 096d84fe60513cdf6bf44343ed0c5f0d012d47bb
