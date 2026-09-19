param(
  [string]$ApiBase = "",
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
  $match = Get-ChildItem -LiteralPath $env:APPDATA -Filter config.json -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
      try {
        $obj = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
        $null -ne $obj.writeToken -and ($null -ne $obj.apiBase -or $_.DirectoryName -match "toc|collector")
      } catch { $false }
    } | Select-Object -First 1
  if ($match) { return $match.FullName }
  throw "Cannot find Collector config.json under APPDATA."
}

function Invoke-CurlJson {
  param(
    [string]$Url,
    [string]$Token,
    [string]$JsonFile,
    [string]$ResponseFile,
    [bool]$UseProxy
  )
  $args = @(
    "-sS",
    "-L",
    "--connect-timeout", "20",
    "--max-time", "90",
    "--retry", "2",
    "-o", $ResponseFile,
    "-w", "%{http_code}",
    "-H", "Accept: application/json",
    "-H", "Content-Type: application/json",
    "-H", "Authorization: Bearer $Token",
    "--data-binary", "@$JsonFile",
    $Url
  )
  if ($UseProxy) {
    $args = @("--proxy", "http://127.0.0.1:$ProxyPort") + $args
  }
  $code = & curl.exe @args
  return [string]$code
}

$configPath = Find-CollectorConfig
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$token = [string]$config.writeToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Collector writeToken is empty in $configPath"
}

$userData = Split-Path -Parent $configPath
$captureDir = Join-Path $userData "local-toc-capture"
$manifestPath = Join-Path $captureDir "manifest.jsonl"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "No capture manifest found: $manifestPath"
}

$rows = @()
Get-Content -LiteralPath $manifestPath -Encoding UTF8 | ForEach-Object {
  if ([string]::IsNullOrWhiteSpace($_)) { return }
  try { $rows += ($_ | ConvertFrom-Json) } catch {}
}
if (-not $rows.Count) { throw "Capture manifest is empty." }

# Keep the newest capture for each DOI + kind.
$latest = @{}
foreach ($row in $rows) {
  $doi = ([string]$row.doi).Trim().ToLowerInvariant()
  $kind = ([string]$row.kind).Trim().ToLowerInvariant()
  if (-not $doi -or $kind -notin @("official","figure1")) { continue }
  $key = "$doi|$kind"
  $latest[$key] = $row
}
$rows = @($latest.Values)

$bases = @()
if ($ApiBase) { $bases += $ApiBase.TrimEnd("/") }
if ($config.apiBase) { $bases += ([string]$config.apiBase).TrimEnd("/") }
if ($config.apiFallbackBase) { $bases += ([string]$config.apiFallbackBase).TrimEnd("/") }
$bases += "https://organic-synthesis-gallery.zhou526316.workers.dev"
$bases = @($bases | Where-Object { $_ } | Select-Object -Unique)

$proxyProbe = Test-NetConnection 127.0.0.1 -Port $ProxyPort -WarningAction SilentlyContinue
$useProxy = [bool]$proxyProbe.TcpTestSucceeded

Write-Host ""
Write-Host "Local TOC capture sync" -ForegroundColor Cyan
Write-Host "Config: $configPath"
Write-Host "Capture manifest: $manifestPath"
Write-Host "Captures: $($rows.Count)"
Write-Host "Proxy: $(if ($useProxy) { "127.0.0.1:$ProxyPort" } else { "direct" })"
Write-Host ""

$success = 0
$failed = 0
$results = @()

foreach ($row in $rows) {
  $doi = ([string]$row.doi).Trim().ToLowerInvariant()
  $kind = ([string]$row.kind).Trim().ToLowerInvariant()
  $file = [string]$row.path
  if (-not (Test-Path -LiteralPath $file)) {
    # Recover from a moved userData path by matching the DOI prefix.
    $prefix = ($doi -replace '[^a-z0-9]+','_').Trim('_')
    $file = Get-ChildItem -LiteralPath $captureDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.BaseName -like "$prefix*" } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $file -or -not (Test-Path -LiteralPath $file)) {
    Write-Host "MISS $doi ($kind): local image file not found" -ForegroundColor Yellow
    $failed++
    continue
  }

  $bytes = [IO.File]::ReadAllBytes($file)
  $mime = [string]$row.mime
  if ([string]::IsNullOrWhiteSpace($mime)) {
    $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
    $mime = switch ($ext) {
      ".png"  { "image/png" }
      ".gif"  { "image/gif" }
      ".webp" { "image/webp" }
      default { "image/jpeg" }
    }
  }
  $dataUrl = "data:$mime;base64,$([Convert]::ToBase64String($bytes))"
  $articleUrl = [string]$row.articleUrl

  $endpoint = "/api/media/local-capture/import"
  $payload = @{
    doi = $doi
    kind = $kind
    articleUrl = $articleUrl
    caption = if ($row.text) { ([string]$row.text).Substring(0, [Math]::Min(500, ([string]$row.text).Length)) } else { "" }
    sourceUrl = [string]$row.sourceUrl
    capturedAt = [string]$row.capturedAt
    imageData = $dataUrl
  }

  $tmpJson = Join-Path $env:TEMP ("toc-sync-" + [Guid]::NewGuid().ToString("N") + ".json")
  $tmpResp = Join-Path $env:TEMP ("toc-sync-" + [Guid]::NewGuid().ToString("N") + ".response")
  $jsonText = $payload | ConvertTo-Json -Depth 6 -Compress
  [IO.File]::WriteAllText($tmpJson, $jsonText, (New-Object Text.UTF8Encoding($false)))

  $ok = $false
  $last = ""
  try {
    foreach ($base in $bases) {
      $url = "$base$endpoint"
      $code = Invoke-CurlJson -Url $url -Token $token -JsonFile $tmpJson -ResponseFile $tmpResp -UseProxy $useProxy
      $last = if (Test-Path -LiteralPath $tmpResp) { Get-Content -LiteralPath $tmpResp -Raw -ErrorAction SilentlyContinue } else { "" }
      if ($code -match '^2\d\d$') {
        Write-Host "OK   $doi ($kind) -> $base" -ForegroundColor Green
        $success++
        $results += [pscustomobject]@{doi=$doi;kind=$kind;status="uploaded";api=$base}
        $ok = $true
        break
      }
      Write-Host "HTTP $code $doi ($kind) via $base" -ForegroundColor Yellow
    }
    if (-not $ok) {
      $failed++
      $results += [pscustomobject]@{doi=$doi;kind=$kind;status="failed";detail=$last}
    }
  } finally {
    Remove-Item -LiteralPath $tmpJson,$tmpResp -Force -ErrorAction SilentlyContinue
  }
}

$out = Join-Path $captureDir "sync-results.json"
[pscustomobject]@{
  syncedAt = (Get-Date).ToString("o")
  success = $success
  failed = $failed
  proxy = if ($useProxy) { "127.0.0.1:$ProxyPort" } else { "direct" }
  results = $results
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $out -Encoding UTF8

Write-Host ""
Write-Host "Sync complete: success=$success failed=$failed" -ForegroundColor Cyan
Write-Host "Result file: $out"

if ($success -eq 0 -and $failed -gt 0) { exit 2 }
