# RUN-LOCAL-VPN-RETRY.ps1
# Corrected balanced-brace version. Updated 2026-09-19.
param(
  [ValidateSet("all","acs","wiley","nature","science")]
  [string]$Publisher = "all"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = Split-Path -Parent $ScriptDir
$QueueDir = Join-Path $CollectorDir "queues"

Set-Location $CollectorDir

$LiveBuilder = Join-Path $ScriptDir "BUILD-LIVE-TOC-DEMAND.ps1"
$LiveReady = $false

if (Test-Path -LiteralPath $LiveBuilder) {
  try {
    & $LiveBuilder
    $LiveReady = $true
  }
  catch {
    Write-Warning ("Live TOC demand generation failed: " + $_.Exception.Message)
    $LiveReady = $false
  }
}

if ($LiveReady) {
  if ($Publisher -eq "all") {
    $Queue = Join-Path $QueueDir "toc-demand-all.txt"
  }
  else {
    $Queue = Join-Path $QueueDir ("toc-demand-" + $Publisher + ".txt")
  }
  $QueueMode = "LIVE CURRENT GALLERY"
}
else {
  $HistoricalBuilder = Join-Path $ScriptDir "BUILD-RETRY-QUEUE.ps1"

  if (Test-Path -LiteralPath $HistoricalBuilder) {
    try {
      & $HistoricalBuilder
    }
    catch {
      throw ("Historical retry queue generation failed: " + $_.Exception.Message)
    }
  }

  if ($Publisher -eq "all") {
    $Queue = Join-Path $CollectorDir "retry-dois.txt"
  }
  else {
    $Queue = Join-Path $CollectorDir ("retry-" + $Publisher + ".txt")
  }
  $QueueMode = "HISTORICAL FALLBACK"
}

if (-not (Test-Path -LiteralPath $Queue)) {
  throw "Retry queue not found: $Queue"
}

$Dois = @(
  Get-Content -LiteralPath $Queue -Encoding UTF8 |
    Where-Object { $_ -match "^10\." }
)

if ($Dois.Count -eq 0) {
  Write-Host ("No unresolved DOI for publisher: " + $Publisher) -ForegroundColor Green
  exit 0
}

$ElectronExe = Join-Path $CollectorDir "node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $ElectronExe)) {
  throw "Electron runtime is missing: $ElectronExe"
}

Write-Host ""
Write-Host "Diagnostic retry mode" -ForegroundColor Cyan
Write-Host ("Publisher   : " + $Publisher)
Write-Host ("DOIs        : " + $Dois.Count)
Write-Host "Browserbase : DISABLED"
Write-Host "Figure 1    : FALLBACK ENABLED"
Write-Host "Diagnostics : ENABLED"
Write-Host ("Queue       : " + $Queue)
Write-Host ("Queue mode  : " + $QueueMode)
Write-Host ""
Write-Host "Institution login/captcha windows stay open for up to 8 minutes." -ForegroundColor Yellow
Write-Host "Complete validation and wait for Collector to continue. Do not close the publisher window during validation." -ForegroundColor Yellow
Write-Host ""

$CollectorArgs = @(
  "start",
  "--",
  "--local-only",
  "--scan-all",
  "--diagnose-misses",
  ("--doi-file=" + $Queue),
  "--show-browser"
)

& npm @CollectorArgs
$CollectorExit = $LASTEXITCODE

$CaptureSync = Join-Path $ScriptDir "SYNC-LOCAL-CAPTURES.ps1"
if (Test-Path -LiteralPath $CaptureSync) {
  try {
    & $CaptureSync
  }
  catch {
    Write-Warning ("Capture upload failed: " + $_.Exception.Message)
  }
}

$DiagSync = Join-Path $ScriptDir "SYNC-LOCAL-DIAGNOSTICS.ps1"
if (Test-Path -LiteralPath $DiagSync) {
  try {
    & $DiagSync
  }
  catch {
    Write-Warning ("Diagnostic upload failed: " + $_.Exception.Message)
  }
}

if ($null -eq $CollectorExit) {
  $CollectorExit = 0
}

exit $CollectorExit
