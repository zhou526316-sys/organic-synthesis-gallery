# GPT conversation response and PowerShell encoding incident

Beijing time: 2026-10-09T08:31:54.248+08:00
Project Organic Synthesis Gallery; user reported literal Windows PowerShell 5.1 parser errors running installer at previous immutable source commit 4c901118cb90131e65256da355580eeaf32c202d.

## User-visible partial reply
问题已经定位：**这是我提供的 PowerShell 脚本存在 UTF-8 编码兼容问题，不是腾讯云服务器故障。**

Windows PowerShell 5.1 对不带 BOM 的 UTF-8 脚本可能按系统 ANSI 编码读取，导致中文提示乱码，继而出现 `The string is missing the terminator` 等语法错误。

**之前的脚本实际上没有开始执行服务器检查，也没有修改 Nginx 或公众号服务。**

你不需要重新下载文件。直接在当前 Windows PowerShell 中执行以下修复代码：

```powershell
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-run.ps1'

$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$content = [System.IO.File]::ReadAllText($dst, $utf8)

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($dst, $content, $utf8Bom)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Preflight -SshUser ubuntu
```

这段代码只把本地脚本转换为 Windows PowerShell 5.1 可识别的 UTF-8 BOM 格式，然后重新运行**只读预检**。不需要管理员权限。

## Progress
Verified earlier run-from-windows.ps1 contained 118 non-ASCII characters and had no UTF-8 BOM. pwsh CI had passed on Linux, but user needed Windows PowerShell 5.1. Fixed installer on branch feature/owner-private-pdf-dual-ingress-20261008 to ASCII text with BOM; update commit 8553c7039211f25745a5d8a0e0e7355523fc7f94. Enhanced CI workflow Windows-latest powershell 5.1 actual raw GitHub download and ParseFile, commit 2037408cd933a44865a6507ff2e1996618cac50d.
GitHub Actions run 37865147379 both jobs success: 9/9 Python regression, Windows PowerShell5.1 checked-out script parser WIN_PS51_LOCAL_PARSE_PASS and raw download WIN_PS51_RAW_DOWNLOAD_PARSE_PASS. GitHub fetch of script at immutable 2037408 shows leading BOM, no other non-ASCII.
The partial inline New-Object constructor notation should be superseded by directly re-downloading the fixed immutable script; no further transcoding necessary. Existing deployment manifest remains off, DNS pdf.gczhouwld.com not yet configured, no production changes.

## Final user-visible continuation
已经修复了仓库中的脚本，并完成了**实际 Windows PowerShell 5.1** 兼容性测试。

修复包括两部分：给 `.ps1` 文件添加 UTF-8 BOM，并将脚本中的中文提示改为 ASCII 字符，避免 Windows PowerShell 5.1 误解码。测试已确认：**从 GitHub 原始链接重新下载脚本后，PowerShell 5.1 可以正常解析**。服务端原有的 9 项安全测试也通过。

**不必再手动转换旧文件编码。** 直接在当前 Windows PowerShell 重新下载修复版并执行只读预检：

```powershell
$src = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/2037408cd933a44865a6507ff2e1996618cac50d/deploy/pdf-gateway/run-from-windows.ps1'
$dst = Join-Path $env:TEMP 'gallery-pdf-gateway-run.ps1'

Invoke-WebRequest -Uri $src -OutFile $dst -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Preflight -SshUser ubuntu
```

运行时仍可能提示输入现有的服务器 SSH 密码或 `sudo` 密码，这是正常的身份验证；不要把密码发送给我。首次 SSH 主机指纹必须先与腾讯云控制台核对。

这次只修复脚本编码及验证兼容性，**并没有远程修改你的 Nginx 或公众号服务**。另外，`pdf.gczhouwld.com` 的 DNS 仍未配置，预检显示 DNS 待处理是正常的。

请把重新运行后的输出发来，我会接着完成零新增费用的 PDF 网关部署检查。

## References
- [Script at verified commit](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/2037408cd933a44865a6507ff2e1996618cac50d/deploy/pdf-gateway/run-from-windows.ps1)
- [Windows 5.1+security CI](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37865147379)
- [PR #420](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/420)
