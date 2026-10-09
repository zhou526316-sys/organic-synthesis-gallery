# Organic Synthesis Gallery — PowerShell 自动 SSH 预检命令重发

北京时间：2026-10-09T08:36:30.008+08:00
用户：“噢噢，那你重新给我代码吧，我先不用服务器的路径”

## 本轮完整用户可见回复

直接在**你电脑上的 Windows PowerShell**（提示符为 `PS C:\Users\asus>`）复制执行下面整段代码。**不需要先 SSH 登录，也不用输入服务器路径**；脚本会自动连接现有腾讯云服务器。

```powershell
$src = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/2037408cd933a44865a6507ff2e1996618cac50d/deploy/pdf-gateway/run-from-windows.ps1'
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-run.ps1'

Invoke-WebRequest -Uri $src -OutFile $dst -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Preflight -SshUser ubuntu
```

这已经是修复了 **Windows PowerShell 5.1 中文编码错误**的版本。执行时按提示使用你原有的 SSH／`sudo` 身份验证；第一次连接时先核对服务器指纹，不要把密码或私钥发给我。

本轮选择的是 **Preflight（预检）**，只核查 DNS、Nginx、证书和云服务器连通性，**不安装网关、不重启公众号服务、不新增付费**。它会通过 SSH 在服务器临时目录复制检查脚本，但不会修改现有 Nginx 配置。

运行后把终端输出发给我，我再判断下一步安装条件。

## 审计
代码使用 immutable revision 2037408cd933a44865a6507ff2e1996618cac50d；先前 Windows PowerShell 5.1 原始下载与 BOM 解析回归通过 run 37865147379。仅本机下载脚本，脚本通过现有 SSH 发送临时文件并执行 --preflight；不触发生产安装、DNS/微信中继修改或付费操作。
