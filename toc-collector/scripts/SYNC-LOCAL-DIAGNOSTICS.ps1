param(
  [int]$ProxyPort = 7899
)

$ErrorActionPreference = "Stop"

function Find-CollectorConfig {
  $candidates = @(
    (Join-Path $env:APPDATA "organic-synthesis-gallery-toc-collector\config.json"),
    (Join-Path $env:APPDATA "Organic Synthesis Gallery TOC Collector\config.json")
  )
  foreach ($path in $candidates) {
    if (Test-Path -LiteralPath $path) { return $path }
  }
  throw "Collector config.json was not found."
}

$configPath = Find-CollectorConfig
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$token = [string]$config.writeToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "Collector writeToken is empty." }

$userData = Split-Path -Parent $configPath
$summary = Join-Path $userData "toc-diagnostics\latest-summary.json"
if (-not (Test-Path -LiteralPath $summary)) { throw "No diagnostic summary found: $summary" }

$url = "https://organic-synthesis-gallery.zhou526316.workers.dev/api/media/local-diagnostics/import"
$response = Join-Path $env:TEMP ("toc-diag-" + [Guid]::NewGuid().ToString("N") + ".json")

$args = @(
  "-sS","-L",
  "--connect-timeout","20",
  "--max-time","90",
  "--retry","2",
  "-o",$response,
  "-w","%{http_code}",
  "-H","Accept: application/json",
  "-H","Content-Type: application/json",
  "-H","Authorization: Bearer $token",
  "--data-binary","@$summary",
  $url
)

$proxy = Test-NetConnection 127.0.0.1 -Port $ProxyPort -WarningAction SilentlyContinue
if ($proxy.TcpTestSucceeded) {
  $args = @("--proxy","http://127.0.0.1:$ProxyPort") + $args
}

$code = & curl.exe @args
$body = if (Test-Path -LiteralPath $response) { Get-Content -LiteralPath $response -Raw } else { "" }
Remove-Item -LiteralPath $response -Force -ErrorAction SilentlyContinue

if ($code -notmatch "^2\d\d$") {
  throw "Diagnostic upload failed: HTTP $code $body"
}

Write-Host "Diagnostic report uploaded to R2." -ForegroundColor Green
Write-Host $body
