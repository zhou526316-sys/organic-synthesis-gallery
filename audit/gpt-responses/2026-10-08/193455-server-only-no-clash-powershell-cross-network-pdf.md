# User insisted universal cross-network access, not Clash testing

Beijing time 2026-10-08T19:34:55.404+08:00
Context: Gallery owner-only PDF independent Tencent gateway, zero additional cost.
User interrupted previous draft: "为什么还要测试clash？我要的是所有网络都能访问‘". Prior user asked for all code to paste into PowerShell.

## First user-visible reply
你说得对。**不应该把测试 Clash、切换 VPN 或更换网络作为解决方案。**
之前提出测试 Clash，是为了判断你电脑为什么连接失败；但你的要求是彻底改造 Gallery，让同一个已授权账号在校园网、家庭宽带、手机网络等正常联网环境下自动使用可用线路。

我们现在不再围绕你的 Clash 排查，而是改造服务器架构：

- **主线路：** 现有 Cloudflare PDF 服务。
- **独立备用线路：** 复用现有腾讯云 Ubuntu 服务器，建立 PDF 专用 HTTPS 网关。
- **自动切换：** 主线路不可达时，网站自行切换，用户无需配置代理。
- **统一权限：** 两条线路验证同一个账号；私有 PDF 不公开。
- **零新增费用：** 只使用现有资源，并设置流量硬限制，避免超额计费。

你的服务器有 2 核 CPU、2 GB 内存和 512 GB 月度流量包，具备初步部署条件。现在需要检查的是**服务器能否安全承载备用网关**，而不是测试你的 Clash。

## Full continuing reply
下面给你的是**仅检查腾讯云服务器的 PowerShell 脚本**，完全没有 Clash、VPN 或客户端切换测试，也不需要管理员权限。它不会修改任何服务器配置。

```powershell
$ErrorActionPreference = 'Continue'
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $desktop)) { $desktop = $env:TEMP }
$log = Join-Path $desktop ('Gallery_Server_Check_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.txt')
$recording = $false

try {
    Start-Transcript -Path $log -Force -ErrorAction Stop | Out-Null
    $recording = $true

    if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
        throw 'Windows 未找到 ssh.exe，请在腾讯云网页终端执行服务器检查。'
    }

    $sshUser = Read-Host '腾讯云 SSH 用户名（直接回车默认 ubuntu；若你平时用 root，请输入 root）'
    if ([string]::IsNullOrWhiteSpace($sshUser)) { $sshUser = 'ubuntu' }
    if ($sshUser -notmatch '^[a-z_][a-z0-9_-]*$') {
        throw 'SSH 用户名格式不正确。'
    }
    $target = $sshUser + '@relay.gczhouwld.com'

    $remote = @'
set +e
echo '==== OS / LOAD ===='
grep '^PRETTY_NAME=' /etc/os-release
uptime
echo '==== MEMORY / DISK ===='
free -h
df -h /
echo '==== TCP PORT 80 / 443 ===='
ss -ltnp '( sport = :80 or sport = :443 )' 2>&1
echo '==== SERVICE STATUS ===='
for svc in nginx caddy apache2 docker; do
  printf '%s: ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done
echo '==== SERVER -> CLOUDFLARE ===='
for url in \
  https://api.gczhouwld.com/api/_healthcheck \
  https://organic-synthesis-gallery.zhou526316.workers.dev/api/_healthcheck
do
  printf '%s\n' "$url"
  curl --noproxy '*' -sS -o /dev/null \
    --connect-timeout 4 --max-time 10 \
    -w 'HTTP=%{http_code} DNS=%{time_namelookup}s TCP=%{time_connect}s TLS=%{time_appconnect}s TTFB=%{time_starttransfer}s TOTAL=%{time_total}s\n' "$url"
  printf 'curl_exit=%s\n' "$?"
done
'@

    $remote = $remote.Replace(([string][char]13 + [string][char]10), [string][char]10)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
    $command = "printf '%s' '$encoded' | base64 -d | bash"
    Write-Host ('即将只读检查：' + $target)
    Write-Host '首次 SSH 连接须核对腾讯云服务器主机指纹，不要盲目接受。'

    & ssh.exe -o ConnectTimeout=8 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=ask $target $command
    Write-Host ('SSH 返回代码：' + $LASTEXITCODE)
} catch {
    Write-Host ('未能完成：' + $_.Exception.Message)
} finally {
    if ($recording) { Stop-Transcript | Out-Null }
    Write-Host ('报告文件：' + $log)
}
```

将整段粘贴进 Windows PowerShell。输入你平时登录腾讯云服务器的 SSH 用户名（默认 `ubuntu`；使用 `root` 就输入 `root`），按现有 SSH 认证方式登录。首次连接如果显示未知主机指纹，需要先与腾讯云控制台核对。

执行完成后，桌面会出现 `Gallery_Server_Check_日期时间.txt`。把这个文本报告发给我即可，不要提供 SSH 密码、私钥或其他密钥。

**这只是零费用、只读部署前检查，不是网关已经上线。** 下一步是否能安全复用现有 HTTPS 端口、以及如何保证不会消耗超额计费流量，要依据服务器检查结果再确认；无法凭截图保证百分之百跨所有网络可达。

## Audit
No code changes, server changes, purchases, DNS changes, account entitlement changes, network settings changes, or background monitoring tasks. Server check script uses existing SSH only, verifies host key, and runs read-only commands (free/df/ss/systemctl is-active/curl anonymous health checks). No Clash testing and no need to supply tokens. New production implementation awaits explicit approval after checks.
