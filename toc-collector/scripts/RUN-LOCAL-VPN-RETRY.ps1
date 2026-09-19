param(
  [ValidateSet("all","acs","wiley","nature","science")]
  [string]$Publisher = "all"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = Split-Path -Parent $ScriptDir
Set-Location $CollectorDir

$liveBuilder = Join-Path $ScriptDir "BUILD-LIVE-TOC-DEMAND.ps1"
$queueDir = Join-Path $CollectorDir "queues"
$liveReady = $false

if (Test-Path -LiteralPath $liveBuilder) {
  try {
    & $liveBuilder
    $liveReady = $true
  } catch {
    Write-Warning ("Live TOC demand generation failed; falling back to local historical queue: " + $_.Exception.Message)
  }
}

if ($liveReady) {
  $queue = if ($Publisher -eq "all") {
    Join-Path $queueDir "toc-demand-all.txt"
  } else {
    Join-Path $queueDir ("toc-demand-" + $Publisher + ".txt")
  }
} else {
  $queueMap = @{
    "all" = "toc-needs-all-2026-09-19.txt"
    "acs" = "toc-needs-acs-2026-09-19.txt"
    "wiley" = "toc-needs-wiley-2026-09-19.txt"
    "nature" = "toc-needs-nature-2026-09-19.txt"
    "science" = "toc-needs-science-2026-09-19.txt"
  }

  $queue = Join-Path $CollectorDir $queueMap[$Publisher]
}

if (-not (Test-Path -LiteralPath $queue)) { throw "Retry queue not found: $queue" }
$dois = @(Get-Content -LiteralPath $queue -Encoding UTF8 | Where-Object { $_ -match "^10\." })
if (-not $dois.Count) {
  Write-Host "No unresolved DOI for publisher: $Publisher" -ForegroundColor Green
  exit 0
}

$electronExe = Join-Path $CollectorDir "node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $electronExe)) {
  throw "Electron runtime is missing: $electronExe"
}

Write-Host ""
Write-Host "Diagnostic retry mode" -ForegroundColor Cyan
Write-Host "Publisher : $Publisher"
Write-Host "DOIs      : $($dois.Count)"
Write-Host "Browserbase: DISABLED"
Write-Host "Figure 1 fallback: ENABLED"
Write-Host "Per-DOI diagnostics: ENABLED"
Write-Host "Queue: $queue"
Write-Host "Queue mode: $(if ($liveReady) { 'LIVE CURRENT GALLERY' } else { 'HISTORICAL FALLBACK' })"
Write-Host ""
Write-Host "Institution login/captcha windows stay open for up to 8 minutes." -ForegroundColor Yellow
Write-Host "Complete validation and wait for Collector to continue. Do not close the publisher window during validation." -ForegroundColor Yellow
Write-Host ""

$collectorArgs = @(
  "start",
  "--",
  "--local-only",
  "--scan-all",
  "--diagnose-misses",
  "--doi-file=$queue",
  "--show-browser"
)

& npm @collectorArgs
$collectorExit = $LASTEXITCODE

$captureSync = Join-Path $ScriptDir "SYNC-LOCAL-CAPTURES.ps1"
if (Test-Path -LiteralPath $captureSync) {
  try {
    & $captureSync
  } catch {
    Write-Warning ("Capture upload failed: " + $_.Exception.Message)
  }
}

$diagSync = Join-Path $ScriptDir "SYNC-LOCAL-DIAGNOSTICS.ps1"
if (Test-Path -LiteralPath $diagSync) {
  try {
    & $diagSync
  } catch {
    Write-Warning ("Diagnostic upload failed: " + $_.Exception.Message)
  }
}

exit $collectorExit
