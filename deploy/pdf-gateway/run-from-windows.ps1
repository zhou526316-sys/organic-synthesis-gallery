<#
PowerShell 5.1+; requires existing ssh.exe and scp.exe.
Default is read-only preflight; install requires explicit -Mode Install and YES.
Never writes tokens/keys or edits the pre-existing WeChat vhost.
#>
[CmdletBinding()]
param(
    [ValidateSet('Preflight','Install','Rollback')]
    [string]$Mode = 'Preflight',
    [string]$SshUser = 'ubuntu'
)
$ErrorActionPreference = 'Stop'
if ($SshUser -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'SSH 用户名格式无效' }
$Server = $SshUser + '@relay.gczhouwld.com'
$Source = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/feature/owner-private-pdf-dual-ingress-20261008/deploy/pdf-gateway'
$Local = Join-Path $env:TEMP ('gallery-pdf-gateway-' + (Get-Date -Format 'yyyyMMddHHmmss'))
$Remote = '/tmp/gallery-pdf-gateway-' + (Get-Date -Format 'yyyyMMddHHmmss')
New-Item -ItemType Directory -Path $Local -Force | Out-Null
Write-Host ('当前模式：' + $Mode)
try {
    foreach ($File in @('gateway.py','install.sh')) {
        $Dst = Join-Path $Local $File
        Invoke-WebRequest -Uri ($Source + '/' + $File) -OutFile $Dst -UseBasicParsing
        if ((Get-Item $Dst).Length -lt 2000) { throw ('下载内容不完整：' + $File) }
    }
    $Options = @('-o','StrictHostKeyChecking=ask','-o','ConnectTimeout=10')
    & ssh.exe @Options $Server ("umask 077; mkdir -p -m 700 '" + $Remote + "'")
    if ($LASTEXITCODE -ne 0) { throw 'SSH 建立临时目录失败' }
    foreach ($File in @('gateway.py','install.sh')) {
        $SourceFile = Join-Path $Local $File
        $TargetFile = $Server + ':' + $Remote + '/' + $File
        & scp.exe -o StrictHostKeyChecking=ask -P 22 $SourceFile $TargetFile
        if ($LASTEXITCODE -ne 0) { throw ('SCP 上传失败：' + $File) }
    }
    $Action = switch ($Mode) {
        'Preflight' { '--preflight' }
        'Install' { '--install' }
        'Rollback' { '--rollback' }
    }
    if ($Mode -eq 'Install') {
        Write-Host '安全安装将新建 PDF 专用服务和 Nginx 虚拟主机，不覆盖公众号站点。'
        if ((Read-Host '确认部署请输入 YES') -cne 'YES') {
            throw '未确认，停止部署'
        }
    }
    $RemoteCommand = "sudo bash '" + $Remote + "/install.sh' '" + $Action + "'"
    & ssh.exe -tt @Options $Server $RemoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw ('服务器未通过当前阶段检查，退出码：' + $LASTEXITCODE)
    }
    Write-Host ('完成模式：' + $Mode)
} finally {
    Write-Host ('本机源文件：' + $Local)
    Write-Host '请勿提供服务器密码、SSH 私钥或带 token 的 PDF URL。'
}
