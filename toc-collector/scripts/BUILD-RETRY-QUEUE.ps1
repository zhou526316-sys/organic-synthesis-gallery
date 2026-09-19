param(
  [string]$SourceFile = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = Split-Path -Parent $ScriptDir
if (-not $SourceFile) { $SourceFile = Join-Path $CollectorDir "full-toc-gaps-2026-09-19.txt" }

function Find-UserData {
  $candidates = @(
    (Join-Path $env:APPDATA "organic-synthesis-gallery-toc-collector"),
    (Join-Path $env:APPDATA "Organic Synthesis Gallery TOC Collector")
  )
  foreach ($dir in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $dir "local-toc-capture\manifest.jsonl")) { return $dir }
  }
  $match = Get-ChildItem -LiteralPath $env:APPDATA -Filter manifest.jsonl -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "local-toc-capture" } |
    Select-Object -First 1
  if ($match) { return Split-Path -Parent (Split-Path -Parent $match.FullName) }
  throw "Cannot find Collector local-toc-capture manifest under APPDATA."
}

function Get-DoiList([string]$Text) {
  $matches = [regex]::Matches($Text, "10\.\d{4,9}/[^\s,;""'<>]+", "IgnoreCase")
  $set = New-Object "System.Collections.Generic.HashSet[string]"
  foreach ($m in $matches) {
    $doi = $m.Value.Trim().ToLowerInvariant().TrimEnd(".",",",";",")")
    if ($doi -match "^10\.\d{4,9}/\S+$") { [void]$set.Add($doi) }
  }
  return @($set)
}

if (-not (Test-Path -LiteralPath $SourceFile)) { throw "Gap source file not found: $SourceFile" }
$all = Get-DoiList (Get-Content -LiteralPath $SourceFile -Raw -Encoding UTF8)

$userData = Find-UserData
$manifest = Join-Path $userData "local-toc-capture\manifest.jsonl"
$captured = New-Object "System.Collections.Generic.HashSet[string]"

Get-Content -LiteralPath $manifest -Encoding UTF8 | ForEach-Object {
  if ([string]::IsNullOrWhiteSpace($_)) { return }
  try {
    $row = $_ | ConvertFrom-Json
    $doi = ([string]$row.doi).Trim().ToLowerInvariant()
    $kind = ([string]$row.kind).Trim().ToLowerInvariant()
    if ($doi -and $kind -in @("official","figure1")) { [void]$captured.Add($doi) }
  } catch {}
}

$retry = @($all | Where-Object { -not $captured.Contains($_) })

function Publisher([string]$doi) {
  if ($doi.StartsWith("10.1021/")) { return "acs" }
  if ($doi.StartsWith("10.1002/")) { return "wiley" }
  if ($doi.StartsWith("10.1038/")) { return "nature" }
  if ($doi.StartsWith("10.1126/")) { return "science" }
  return "other"
}

$utf8NoBom = New-Object Text.UTF8Encoding($false)
$outAll = Join-Path $CollectorDir "retry-dois.txt"
$allText = ($retry -join [Environment]::NewLine)
if ($retry.Count) { $allText += [Environment]::NewLine }
[IO.File]::WriteAllText($outAll, $allText, $utf8NoBom)

$counts = @{}
foreach ($publisher in @("acs","wiley","nature","science","other")) {
  $items = @($retry | Where-Object { (Publisher $_) -eq $publisher })
  $counts[$publisher] = $items.Count
  $out = Join-Path $CollectorDir "retry-$publisher.txt"
  $text = ($items -join [Environment]::NewLine)
  if ($items.Count) { $text += [Environment]::NewLine }
  [IO.File]::WriteAllText($out, $text, $utf8NoBom)
}

Write-Host ""
Write-Host "Retry queue generated" -ForegroundColor Cyan
Write-Host "Original gaps : $($all.Count)"
Write-Host "Captured local: $($captured.Count)"
Write-Host "Retry total   : $($retry.Count)"
Write-Host "ACS           : $($counts.acs)"
Write-Host "Wiley         : $($counts.wiley)"
Write-Host "Nature        : $($counts.nature)"
Write-Host "Science       : $($counts.science)"
Write-Host "Other         : $($counts.other)"
Write-Host "Queue         : $outAll"
