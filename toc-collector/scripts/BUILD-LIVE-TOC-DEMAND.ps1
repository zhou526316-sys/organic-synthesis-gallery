param(
  [int]$ProxyPort = 7899
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = Split-Path -Parent $ScriptDir
$QueueDir = Join-Path $CollectorDir "queues"
$TempDir = Join-Path $env:TEMP ("toc-demand-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $QueueDir,$TempDir | Out-Null

$Base = "https://zhou526316-sys.github.io/organic-synthesis-gallery"

function Download-File([string]$Name) {
  $url = "$Base/$Name"
  $target = Join-Path $TempDir $Name
  try {
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 45
  } catch {
    $probe = Test-NetConnection 127.0.0.1 -Port $ProxyPort -WarningAction SilentlyContinue
    if (-not $probe.TcpTestSucceeded) { throw }
    & curl.exe -L --proxy "http://127.0.0.1:$ProxyPort" --retry 3 --connect-timeout 20 -o $target $url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
  }
  return $target
}

function Normalize-Doi([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $s = $Value.Trim().ToLowerInvariant()
  $s = $s -replace '^https?://(?:dx\.)?doi\.org/',''
  $s = $s -replace '^doi:\s*',''
  $s = $s -replace '[?#].*$',''
  if ($s -match '^10\.\d{4,9}/\S+$') { return $s }
  return $null
}

function Publisher([string]$Doi) {
  if ($Doi.StartsWith("10.1021/")) { return "acs" }
  if ($Doi.StartsWith("10.1002/")) { return "wiley" }
  if ($Doi.StartsWith("10.1038/")) { return "nature" }
  if ($Doi.StartsWith("10.1126/")) { return "science" }
  return "other"
}

function Is-Official-Toc($Toc) {
  if ($null -eq $Toc -or -not $Toc.available -or [string]::IsNullOrWhiteSpace([string]$Toc.imageUrl)) { return $false }
  $reason = ([string]$Toc.reason).ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($reason)) { return $true }
  if ($reason -eq "figure1_fallback") { return $false }
  if ($reason -eq "pdf_primary_fallback") { return $false }
  if ($reason.StartsWith("figure_fallback:")) { return $false }
  if ($reason.Contains("fallback") -and -not $reason.Contains("official")) { return $false }
  return $true
}

function Has-Any-Visual($Record) {
  if ($null -eq $Record) { return $false }
  if ($null -ne $Record.toc -and $Record.toc.available -and -not [string]::IsNullOrWhiteSpace([string]$Record.toc.imageUrl)) { return $true }
  if ($null -ne $Record.figures -and $null -ne $Record.figures.figures) {
    foreach ($fig in @($Record.figures.figures)) {
      if (-not [string]::IsNullOrWhiteSpace([string]$fig.imageUrl)) { return $true }
    }
  }
  return $false
}

function Add-Papers($Items, [hashtable]$Map) {
  foreach ($raw in @($Items)) {
    $doi = Normalize-Doi ([string]$raw.doi)
    if (-not $doi) { $doi = Normalize-Doi ([string]$raw.url) }
    if (-not $doi) { continue }
    if (-not $Map.ContainsKey($doi)) {
      $Map[$doi] = [pscustomobject]@{
        doi = $doi
        journal = [string]$raw.journal
        title = [string]$raw.title
        date = [string]$raw.date
      }
    }
  }
}

try {
  Write-Host "Downloading current gallery snapshot..." -ForegroundColor Cyan
  $papersFile = Download-File "papers.gz.b64"
  $totalFile = Download-File "total-synthesis.json"
  $manualFile = Download-File "manual-supplement.json"
  $auditFile = Download-File "final-audit-supplement.json"
  $mediaFile = Download-File "media-index.json"

  $encoded = (Get-Content -LiteralPath $papersFile -Raw).Trim()
  $compressed = [Convert]::FromBase64String($encoded)
  $input = New-Object IO.MemoryStream(,$compressed)
  $gzip = New-Object IO.Compression.GZipStream($input,[IO.Compression.CompressionMode]::Decompress)
  $reader = New-Object IO.StreamReader($gzip,[Text.Encoding]::UTF8)
  $baseJson = $reader.ReadToEnd()
  $reader.Dispose()
  $gzip.Dispose()
  $input.Dispose()

  $basePapers = $baseJson | ConvertFrom-Json
  $total = Get-Content -LiteralPath $totalFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $manual = Get-Content -LiteralPath $manualFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $audit = Get-Content -LiteralPath $auditFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $media = Get-Content -LiteralPath $mediaFile -Raw -Encoding UTF8 | ConvertFrom-Json

  $papers = @{}
  Add-Papers $basePapers $papers
  Add-Papers $total.papers $papers
  Add-Papers $manual.papers $papers
  Add-Papers $audit.papers $papers

  $mediaMap = @{}
  if ($null -ne $media.items) {
    foreach ($prop in $media.items.PSObject.Properties) {
      $mediaMap[$prop.Name.ToLowerInvariant()] = $prop.Value
    }
  }

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($doi in $papers.Keys) {
    $record = if ($mediaMap.ContainsKey($doi)) { $mediaMap[$doi] } else { $null }
    if (Is-Official-Toc $record.toc) { continue }
    $paper = $papers[$doi]
    $anyVisual = Has-Any-Visual $record
    $rows.Add([pscustomobject]@{
      doi = $doi
      publisher = Publisher $doi
      journal = $paper.journal
      date = $paper.date
      state = if ($anyVisual) { "fallback_only" } else { "no_visual" }
      existingReason = if ($null -ne $record -and $null -ne $record.toc) { [string]$record.toc.reason } else { "" }
      title = $paper.title
    })
  }

  $rows = @($rows | Sort-Object publisher,journal,@{Expression="date";Descending=$true},doi)
  $utf8NoBom = New-Object Text.UTF8Encoding($false)

  function Write-DoiList([string]$Name, $List) {
    $path = Join-Path $QueueDir $Name
    $text = (@($List) | ForEach-Object { $_.doi }) -join [Environment]::NewLine
    if (@($List).Count) { $text += [Environment]::NewLine }
    [IO.File]::WriteAllText($path,$text,$utf8NoBom)
  }

  Write-DoiList "toc-demand-all.txt" $rows
  Write-DoiList "toc-demand-no-visual.txt" @($rows | Where-Object state -eq "no_visual")
  Write-DoiList "toc-demand-official-upgrade.txt" @($rows | Where-Object state -eq "fallback_only")
  foreach ($publisher in @("acs","wiley","nature","science","other")) {
    Write-DoiList "toc-demand-$publisher.txt" @($rows | Where-Object publisher -eq $publisher)
  }

  $rows | Export-Csv -LiteralPath (Join-Path $QueueDir "toc-demand-all.csv") -NoTypeInformation -Encoding UTF8

  $summary = [pscustomobject]@{
    generatedAt = (Get-Date).ToString("o")
    webpageDoiCount = $papers.Count
    mediaRecordCount = $mediaMap.Count
    demandTotal = @($rows).Count
    noVisual = @($rows | Where-Object state -eq "no_visual").Count
    fallbackOnlyNeedsOfficialUpgrade = @($rows | Where-Object state -eq "fallback_only").Count
    byPublisher = [pscustomobject]@{
      acs = @($rows | Where-Object publisher -eq "acs").Count
      wiley = @($rows | Where-Object publisher -eq "wiley").Count
      nature = @($rows | Where-Object publisher -eq "nature").Count
      science = @($rows | Where-Object publisher -eq "science").Count
      other = @($rows | Where-Object publisher -eq "other").Count
    }
  }

  $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $QueueDir "toc-demand-summary.json") -Encoding UTF8

  Write-Host ""
  Write-Host "LIVE TOC DEMAND READY" -ForegroundColor Green
  Write-Host "Website DOI total : $($summary.webpageDoiCount)"
  Write-Host "Media records     : $($summary.mediaRecordCount)"
  Write-Host "Need official TOC : $($summary.demandTotal)"
  Write-Host "  No visual       : $($summary.noVisual)"
  Write-Host "  Fallback only   : $($summary.fallbackOnlyNeedsOfficialUpgrade)"
  Write-Host "ACS               : $($summary.byPublisher.acs)"
  Write-Host "Wiley             : $($summary.byPublisher.wiley)"
  Write-Host "Nature            : $($summary.byPublisher.nature)"
  Write-Host "Science           : $($summary.byPublisher.science)"
  Write-Host "Other             : $($summary.byPublisher.other)"
  Write-Host "All DOI queue     : $(Join-Path $QueueDir 'toc-demand-all.txt')"
} finally {
  Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
