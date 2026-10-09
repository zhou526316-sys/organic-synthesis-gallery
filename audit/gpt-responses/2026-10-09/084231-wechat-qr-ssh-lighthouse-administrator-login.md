# Existing Tencent Lighthouse QR-SSH preflight login explained
Beijing time: 2026-10-09T08:42:31.112+08:00.
Context: User shared screenshot of `run-from-windows.ps1 -Mode Preflight` displaying terminal QR and text "请使用微信扫码安全登录" with a qcloud.com temporary login URL. This URL/session code is intentionally not reproduced in this record.

## Partial user-visible response already delivered

从截图可以确认：**PowerShell 脚本已经运行到 SSH 身份验证阶段，出现了微信扫码安全登录二维码。**

这不是 PDF 网关的安装页面，也不是需要你输入服务器路径。它是连接云服务器时出现的身份验证步骤。

目前尚未进入服务器预检阶段，**没有修改 Nginx、公众号服务或 PDF 配置**。

截图中的二维码包含一次性登录信息。建议不要再公开转发，后续可以重新生成新的二维码。

## Continued final user-visible response

已经查到腾讯云的**官方说明**：这是轻量应用服务器开启的“扫码安全登录”，SSH 终端弹出二维码后，使用微信进入“腾讯云助手”小程序，以具有服务器权限的腾讯云账号验证并确认登录；它会**取代普通密码登录**，并不代表脚本执行失败。
官方来源：
https://cloud.tencent.com.cn/document/product/1207/122537
https://cloud.tencent.com/document/practice/296/111416

**你现在只需在自己的电脑终端操作：**如果二维码仍有效，用微信扫描**本机 PowerShell 中当前显示的二维码**，在“腾讯云助手”中核对账号及服务器登录请求，点击“确认登录”。不要扫描聊天截图里的旧二维码，也不要把二维码/登录链接继续分享；过期可先 `Ctrl+C` 结束，再重运行原来的 Preflight 命令以生成新码。

需要提前说明：当前预检脚本依次建立 **1 次 SSH 临时目录连接、2 次 SCP 文件上传连接、1 次 SSH 运行检查连接**，腾讯云可能要求对每次连接再次扫码。这是脚本的连接方式，而不是 Gallery 用户要做的事；它只发生在你作为**服务器管理员**检查部署时。不要为省扫码而关闭腾讯云主机安全或修改 SSH 登录配置。

验证通过后终端会继续出现 `SCP` 上传或 `[CHECK]` 预检输出。请把后续**文字结果**发给我（隐藏任何口令及一次性链接）；我会根据 DNS、TLS 和 Nginx 检查结果继续。现在没有安装或启用 PDF 备用网关。

## Current implementation status
Production remains unmodified by this message. Prior user approved isolated Tencent gateway, hard incremental ¥0. Current script is read-only Preflight. No SSH credentials or QR token stored.
