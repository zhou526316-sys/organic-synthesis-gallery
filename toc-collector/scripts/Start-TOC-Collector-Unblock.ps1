[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root 'Organic Synthesis Gallery TOC Collector.exe'
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) 'toc-collector-bootstrap.log'

function Write-LaunchLog([string]$Message) {
    try {
        [IO.File]::AppendAllText($bootstrap, ('[{0:o}] [zone-safe launcher] {1}{2}' -f [DateTime]::UtcNow, $Message, [Environment]::NewLine))
    } catch {}
}

Write-LaunchLog ('enter root={0}' -f $root)
if (-not (Test-Path -LiteralPath $exe)) {
    Write-LaunchLog ('missing-exe path={0}' -f $exe)
    throw "TOC Collector executable not found: $exe"
}

$removed = 0
Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        # Windows PowerShell 5.1 cannot Test-Path an alternate data stream.
        $hadZone = $null -ne (Get-Item -LiteralPath $_.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue)
        Unblock-File -LiteralPath $_.FullName -ErrorAction Stop
        $hasZone = $null -ne (Get-Item -LiteralPath $_.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue)
        if ($hadZone -and -not $hasZone) { $removed += 1 }
    } catch {
        Write-LaunchLog ('unblock-warning file={0} error={1}' -f $_.FullName, $_.Exception.Message)
    }
}
Write-LaunchLog ('unblock-complete removed={0}' -f $removed)

$process = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru
Write-LaunchLog ('process-created pid={0}' -f $process.Id)
Start-Sleep -Milliseconds 800
$process.Refresh()
if ($process.HasExited) {
    Write-LaunchLog ('early-exit code={0}' -f $process.ExitCode)
    throw "TOC Collector exited immediately with code $($process.ExitCode). See $bootstrap"
}
Write-LaunchLog 'process-alive-after-800ms'
