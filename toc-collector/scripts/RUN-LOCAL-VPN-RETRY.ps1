param(
  [ValidateSet("all","acs","wiley","nature","science")]
  [string]$Publisher = "all"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = Split-Path -Parent $ScriptDir
Set-Location $CollectorDir

& (Join-Path $ScriptDir "BUILD-RETRY-QUEUE.ps1")
if ($LASTEXITCODE -ne 0) { throw "Retry queue generation failed." }

$queue = if ($Publisher -eq "all") {
  Join-Path $CollectorDir "retry-dois.txt"
} else {
  Join-Path $CollectorDir "retry-$Publisher.txt"
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
