param(
  [string]$DoiFile = "",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = Split-Path -Parent $ScriptDir
Set-Location $CollectorDir

if (-not $DoiFile) {
  $DoiFile = Join-Path $CollectorDir "full-toc-gaps-2026-09-19.txt"
}
$DoiFile = (Resolve-Path $DoiFile).Path

Write-Host ""
Write-Host "Organic Synthesis Gallery - Local VPN TOC scan" -ForegroundColor Cyan
Write-Host "Browserbase: DISABLED"
Write-Host "DOI file: $DoiFile"
Write-Host "Official TOC only: YES"
Write-Host "Local captures: Electron userData\local-toc-capture"
Write-Host ""

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Install Node.js first."
}
if (-not (Test-Path (Join-Path $CollectorDir "node_modules\electron"))) {
  Write-Host "Installing Collector dependencies..." -ForegroundColor Yellow
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed: $LASTEXITCODE" }
}

npm run check
if ($LASTEXITCODE -ne 0) { throw "Collector check failed: $LASTEXITCODE" }

$argsList = @(
  "--local-only",
  "--scan-all",
  "--official-only",
  "--doi-file=$DoiFile"
)
if (-not $NoBrowser) { $argsList += "--show-browser" }

Write-Host ""
Write-Host "Starting local-only Collector. Keep your VPN connected." -ForegroundColor Green
Write-Host "If ACS/Wiley asks for institution login or verification, complete it in the visible Collector browser window."
Write-Host ""

npm start -- @argsList
exit $LASTEXITCODE
