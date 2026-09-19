param(
  [switch]$NoClipboard
)

$ErrorActionPreference = "SilentlyContinue"

$base = Join-Path $env:APPDATA "organic-synthesis-gallery-toc-collector"
$configPath = Join-Path $base "config.json"
$statePath  = Join-Path $base "state.json"
$logPath    = Join-Path $base "collector.log"

function Get-HashPrefix([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash).Replace("-", "").ToLower()).Substring(0, 8)
  } finally {
    $sha.Dispose()
  }
}

function Get-SafeJson([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json } catch { return $null }
}

$config = Get-SafeJson $configPath
$state  = Get-SafeJson $statePath
$jobs = $null

$proc = Get-Process | Where-Object {
  try { $_.Path -like "*Organic Synthesis Gallery TOC Collector.exe" } catch { $false }
} | Select-Object -First 1

$queueInfo = [ordered]@{
  ok = $false
  total = $null
  acs = $null
  wiley = $null
  other = $null
  error = $null
}

try {
  $apiBase = if ($config.apiBase) { [string]$config.apiBase } else { "https://api.gczhouwld.com" }
  $resp = Invoke-RestMethod -Uri ($apiBase.TrimEnd("/") + "/api/media/bridge-queue") -Method Get -TimeoutSec 30
  if ($resp -is [System.Array]) { $items = @($resp) }
  elseif ($null -ne $resp.items) { $items = @($resp.items) }
  elseif ($null -ne $resp.queue) { $items = @($resp.queue) }
  elseif ($null -ne $resp.data) { $items = @($resp.data) }
  else { $items = @() }

  $acs = @($items | Where-Object { [string]$_.doi -match '^10\.1021/' }).Count
  $wiley = @($items | Where-Object { [string]$_.doi -match '^10\.1002/' }).Count

  $queueInfo.ok = $true
  $queueInfo.total = $items.Count
  $queueInfo.acs = $acs
  $queueInfo.wiley = $wiley
  $queueInfo.other = $items.Count - $acs - $wiley
  try { $jobs = Invoke-RestMethod -Uri ($apiBase.TrimEnd('/') + '/api/media/jobs/status') -TimeoutSec 30 } catch {}
} catch {
  $queueInfo.error = $_.Exception.Message
}

$logLines = @()
$wssHost = $null
if (Test-Path -LiteralPath $logPath) {
  $raw = Get-Content -LiteralPath $logPath -Tail 800
  foreach ($entry in $raw) {
    if (-not $wssHost -and $entry -match 'wss://([^/\s\x1b]+)') { $wssHost = $Matches[1] }
  }
  $logLines = @(
    $raw |
      Where-Object {
        $_ -match 'browserbase|connectOverCDP|cdp_|session_|manual_required|upload_|paper failed|bridge-queue|api_request_success'
      } |
      Select-Object -Last 100 |
      ForEach-Object {
        $line = $_
        $line = $line -replace '(?i)(Bearer\s+)[A-Za-z0-9._\-]+', '$1[REDACTED]'
        $line = $line -replace '(?i)("?(?:writeToken|browserbaseApiKey|apiKey)"?\s*[:=]\s*"?)[^",\s]+', '$1[REDACTED]'
        foreach ($secret in @($config.writeToken, $config.browserbaseApiKey, $env:BROWSERBASE_API_KEY, $env:BRIDGE_WRITE_TOKEN)) {
          if (-not [string]::IsNullOrWhiteSpace([string]$secret)) { $line = $line.Replace([string]$secret, '[REDACTED]') }
        }
        $line = $line -replace 'wss://[^\s"<>]+', '[CDP URL REDACTED]'
        $line
      }
  )
}

$wssTest = $null
if ($wssHost) {
  try {
    $tnc = Test-NetConnection $wssHost -Port 443 -WarningAction SilentlyContinue
    $wssTest = [ordered]@{
      host = $wssHost
      remoteAddress = [string]$tnc.RemoteAddress
      tcp443 = [bool]$tnc.TcpTestSucceeded
    }
  } catch {
    $wssTest = [ordered]@{
      host = $wssHost
      tcp443 = $false
      error = $_.Exception.Message
    }
  }
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  collector = [ordered]@{
    running = [bool]$proc
    pid = if ($proc) { $proc.Id } else { $null }
    path = if ($proc) { $proc.Path } else { $null }
    version = if ($proc) {
      try { (Get-Item -LiteralPath $proc.Path).VersionInfo.ProductVersion } catch { $null }
    } else { $null }
  }
  config = [ordered]@{
    exists = Test-Path -LiteralPath $configPath
    apiBase = $config.apiBase
    fallbackBase = $config.apiFallbackBase
    pollMinutes = $config.pollMinutes
    maxPerCycle = $config.maxPerCycle
    writeTokenConfigured = -not [string]::IsNullOrWhiteSpace([string]$config.writeToken)
    writeTokenLength = ([string]$config.writeToken).Length
    writeTokenHash8 = Get-HashPrefix ([string]$config.writeToken)
    browserbaseConfigured = -not [string]::IsNullOrWhiteSpace([string]$config.browserbaseApiKey)
    browserbaseKeyLength = ([string]$config.browserbaseApiKey).Length
    browserbaseKeyHash8 = Get-HashPrefix ([string]$config.browserbaseApiKey)
    browserbaseProjectIdConfigured = -not [string]::IsNullOrWhiteSpace([string]$config.browserbaseProjectId)
  }
  queue = $queueInfo
  leaseQueue = [ordered]@{
    available = [bool]$jobs
    summary = $jobs.summary
    publishers = $jobs.publishers
    activeLeases = $jobs.activeLeases
    manualRequired = @($jobs.recent | Where-Object { $_.state -eq 'manual_required' } | Select-Object doi,publisher,last_failure_reason)
    recentFailures = @($jobs.recent | Where-Object { $_.last_failure_reason } | Select-Object -First 15 doi,publisher,last_failure_reason)
    recentUploads = @($jobs.recent | Where-Object { $_.visual_kind } | Select-Object -First 15 doi,publisher,visual_kind,visual_source)
  }
  browserbase = [ordered]@{
    status = $state.browserbase.status
    lastSuccessDoi = $state.browserbase.lastSuccessDoi
    sessions = $state.browserbase.sessions
    manualSessions = @($state.browserbase.manual.PSObject.Properties | ForEach-Object { $_.Value | Select-Object publisher,doi,sessionId,contextId,status })
    acceptance = $state.browserbase.acceptance
    batch = $state.browserbase.batch
  }
  lastSummary = $state.lastSummary
  websocketConnectivity = $wssTest
  relevantLogTail = $logLines
}

$json = $report | ConvertTo-Json -Depth 12
$outFile = Join-Path $env:TEMP "toc-collector-status.json"
$json | Set-Content -LiteralPath $outFile -Encoding UTF8

if (-not $NoClipboard) {
  try { $json | Set-Clipboard } catch {}
}

Write-Host ""
Write-Host "Collector status report:" -ForegroundColor Green
Write-Host $outFile
if (-not $NoClipboard) {
  Write-Host "Copied to clipboard. Paste it into ChatGPT." -ForegroundColor Cyan
}
