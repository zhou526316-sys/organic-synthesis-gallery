# Gallery 私有 PDF 网关：重复扫码解释与一次连接只读预检

北京时间：2026-10-09T10:17:56.344+08:00
用户：“怎么扫码登陆成功后，又发下一条扫码？目的是什么？现在？”

## 用户可见前段
这是因为**之前的预检脚本设计得不够合理，建立了多次独立 SSH 连接**，而腾讯云要求每次连接重新扫码验证。

它实际上分为四步：

1. 第一次扫码：SSH 连接服务器，建立临时目录。
2. 第二次扫码：SCP 上传 PDF 网关程序。
3. 第三次扫码：SCP 上传部署检查脚本。
4. 第四次扫码：SSH 执行服务器预检。

**这些扫码不是在登录 Gallery，也不是在给 PDF 获取权限。** 目的只是管理员连接腾讯云服务器，检查部署条件。

你不需要继续这样反复扫码。**现在可以按 `Ctrl+C` 停止原脚本**，返回 `PS C:\Users\asus>`。因为运行的是 `Preflight`，目前没有安装 PDF 网关或修改 Nginx。

下面我给你改成只建立**一次 SSH 连接**的检查方式，不上传文件，也不需要反复扫码。

## 用户可见后段
这不是腾讯云在要求你重复进行不同业务的登录，而是**原脚本连续发起了 4 次独立连接**。每次扫码成功只对当前那一次 SSH/SCP 连接有效，所以它又显示下一张二维码。这是脚本流程冗余，不是你操作有问题。

现在如果不想继续扫码，按 `Ctrl+C` 回到 Windows PowerShell。下面这段改用**一次 SSH 连接**完成部署前检查，不再通过 SCP 上传两份文件：

```powershell
$check = @'
set +e
echo '=== DNS ==='
getent ahostsv4 pdf.gczhouwld.com | awk '$2=="STREAM" {print "PDF:",$1;exit}'
getent ahostsv4 relay.gczhouwld.com | awk '$2=="STREAM" {print "Relay:",$1;exit}'

echo '=== NGINX ==='
sudo -n nginx -t 2>&1
echo '=== EXISTING SITE NAMES ==='
ls -1 /etc/nginx/sites-enabled/ 2>/dev/null

echo '=== TLS CERTIFICATE ==='
if sudo -n test -r /etc/letsencrypt/live/pdf.gczhouwld.com/fullchain.pem; then
  sudo -n openssl x509 -in /etc/letsencrypt/live/pdf.gczhouwld.com/fullchain.pem -noout -checkhost pdf.gczhouwld.com
else
  echo '[PENDING] PDF TLS certificate missing or unreadable'
fi
echo '=== CERTBOT ==='
command -v certbot || echo '[PENDING] certbot not installed'

echo '=== PDF GATEWAY PORT ==='
ss -ltn '( sport = :18867 )'

echo '=== UPSTREAM CLOUD API ==='
curl --noproxy '*' -sS -o /dev/null --connect-timeout 4 --max-time 10 -w 'HTTP:%{http_code} total:%{time_total}s\n' https://api.gczhouwld.com/api/_healthcheck
'@
$check = $check.Replace(([string][char]13 + [string][char]10), [string][char]10)
$encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($check))
$remoteCommand = "printf '%s' '$encoded' | base64 -d | bash"
& ssh.exe -p 22 -o StrictHostKeyChecking=ask -o ConnectTimeout=10 ubuntu@relay.gczhouwld.com $remoteCommand
```

你只需要为这一条 SSH 连接扫码一次。它只读取 DNS、Nginx、证书工具、PDF 网关端口和 Cloudflare 连通性；不安装软件、不创建 PDF 服务、不改公众号配置，也不涉及 Clash。

如果 Nginx 检查显示 `sudo: a password is required`，也不用关闭腾讯云扫码安全功能；把文字结果发来，我再调整只读检查方式。

**现在的目的只是确认能否安全安装 PDF 备用网关，尚未上线。** 把这一次输出贴给我即可，先不要执行 `Install`。

## 核查依据
根据 GitHub 固定版本 `4c901118cb90131e65256da355580eeaf32c202d/deploy/pdf-gateway/run-from-windows.ps1` 原代码：外层 SSH 建目录一次，SCP 循环上传 gateway.py/install.sh 各一次，最后 SSH 运行 sudo bash --preflight 一次。每个连接独立由腾讯云扫码验证，总计可能 4 次。原 Preflight 未执行安装，但可能已建立临时目录及上传文件。

替代的单次 SSH 命令使用无密码/无登录令牌的 UTF-8 Base64 编码只读 Bash 脚本，通过 SSH 命令行运行，仅检查 DNS、nginx -t、站点文件名、证书、certbot、内部端口与匿名上游健康。它不是已在用户服务器实测的结果；用户需发送实际输出。不修改服务器生产配置或私有 PDF、公众号中继、DNS，不新增费用；原则上单次 SSH 只要求一次二维码验证。
