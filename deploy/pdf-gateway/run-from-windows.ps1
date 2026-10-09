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
if ($SshUser -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid SSH username' }
$Server = $SshUser + '@relay.gczhouwld.com'
$Source = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/f36fc03b2747f1fbaac2799854b62c04dd594b16/deploy/pdf-gateway'
$Local = Join-Path $env:TEMP ('gallery-pdf-gateway-' + (Get-Date -Format 'yyyyMMddHHmmss'))
$Remote = '/tmp/gallery-pdf-gateway-' + (Get-Date -Format 'yyyyMMddHHmmss')
New-Item -ItemType Directory -Path $Local -Force | Out-Null
Write-Host ('Mode: ' + $Mode)
try {
    foreach ($File in @('gateway.py','install.sh')) {
        $Dst = Join-Path $Local $File
        Invoke-WebRequest -Uri ($Source + '/' + $File) -OutFile $Dst -UseBasicParsing
        if ((Get-Item $Dst).Length -lt 2000) { throw ('Incomplete downloaded file: ' + $File) }
    }
    $Options = @('-o','StrictHostKeyChecking=ask','-o','ConnectTimeout=10')
    & ssh.exe @Options $Server ("umask 077; mkdir -p -m 700 '" + $Remote + "'")
    if ($LASTEXITCODE -ne 0) { throw 'SSH temporary directory creation failed' }
    foreach ($File in @('gateway.py','install.sh')) {
        $SourceFile = Join-Path $Local $File
        $TargetFile = $Server + ':' + $Remote + '/' + $File
        & scp.exe -o StrictHostKeyChecking=ask -P 22 $SourceFile $TargetFile
        if ($LASTEXITCODE -ne 0) { throw ('SCP upload failed: ' + $File) }
    }
    $Action = switch ($Mode) {
        'Preflight' { '--preflight' }
        'Install' { '--install' }
        'Rollback' { '--rollback' }
    }
    if ($Mode -eq 'Install') {
        Write-Host 'This installs a separate PDF service and nginx host; the WeChat relay is not overwritten.'
        if ((Read-Host 'To approve installation, type YES') -cne 'YES') {
            throw 'Installation canceled'
        }
    }
    $RemoteCommand = "sudo bash '" + $Remote + "/install.sh' '" + $Action + "'"
    & ssh.exe -tt @Options $Server $RemoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw ('Remote command failed; exit code: ' + $LASTEXITCODE)
    }
    Write-Host ('Finished mode: ' + $Mode)
} finally {
    Write-Host ('Local downloaded sources: ' + $Local)
    Write-Host 'Do not share SSH credentials or signed PDF URLs.'
}
