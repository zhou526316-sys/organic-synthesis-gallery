<#
Tencent Gallery PDF private gateway: one SSH login per invocation.
Run from LOCAL Windows PowerShell 5.1+ (not the Ubuntu shell).
This script does not install software on Windows or read personal PDF data.
#>
[CmdletBinding()]
param(
    [ValidateSet('Preflight','Diagnose','Install','Rollback')]
    [string]$Mode = 'Preflight',
    [string]$SshUser = 'ubuntu'
)
$ErrorActionPreference = 'Stop'
if ($SshUser -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid SSH username' }
if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
    throw 'Windows OpenSSH client not found: ssh.exe'
}
$Server = $SshUser + '@relay.gczhouwld.com'
$PinnedSource = '22bf1a51c85201b691d5bf07b6c28a7b458c1a02'
$GithubRaw = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/' + $PinnedSource + '/deploy/pdf-gateway'
$RemoteMode = switch ($Mode) {
    'Preflight' { '--preflight' }
    'Diagnose' { '--diagnose' }
    'Install' { '--install' }
    'Rollback' { '--rollback' }
}
Write-Host ('Gallery PDF: ' + $Mode + ' / one SSH login / no new paid service')
if ($Mode -eq 'Diagnose') { Write-Host '[DIAG] Read-only nginx virtual-host report; no certificate request, PDF access or config changes.' }
if ($Mode -eq 'Install') {
    Write-Host 'This installs a private PDF gateway on the EXISTING Tencent VM.'
    Write-Host 'It may obtain a free TLS certificate and gracefully reload Nginx.'
    Write-Host 'The WeChat relay nginx vhost must remain unchanged.'
    $answer = Read-Host 'To authorize the previously approved deployment type YES'
    if ($answer -cne 'YES') { throw 'Installation canceled; no remote connection was made' }
}
if ($Mode -eq 'Rollback') {
    $answer = Read-Host 'To remove only the managed PDF gateway type ROLLBACK'
    if ($answer -cne 'ROLLBACK') { throw 'Rollback canceled' }
}
$bootstrap = @'
set -Eeuo pipefail
umask 077
MODE="__REMOTE_MODE__"
BASE="__GITHUB_RAW__"
WORK="$(mktemp -d /tmp/gallery-pdf-once.XXXXXXXX)"
cleanup() {
  rm -f -- "$WORK/gateway.py" "$WORK/install.sh" "$WORK/nginx_include.py"
  rmdir -- "$WORK" 2>/dev/null || true
}
trap cleanup EXIT
printf '[CHECK] One SSH authentication accepted; preparing %s\n' "$MODE"
for file in gateway.py install.sh nginx_include.py; do
  curl --noproxy '*' --fail --silent --show-error --location \
    --connect-timeout 8 --max-time 40 \
    "$BASE/$file" --output "$WORK/$file"
  test "$(wc -c < "$WORK/$file")" -gt 2000 || {
    echo '[STOP] Incomplete pinned gateway source file' >&2
    exit 1
  }
done
bash -n "$WORK/install.sh"
python3 -B -c 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())' "$WORK/nginx_include.py"
python3 -B -c 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())' "$WORK/gateway.py"
echo '[CHECK] Pinned sources downloaded and syntax-checked.'
sudo bash "$WORK/install.sh" "$MODE"
printf '[COMPLETE] Gateway stage: %s\n' "$MODE"
'@
$bootstrap = $bootstrap.Replace('__REMOTE_MODE__', $RemoteMode)
$bootstrap = $bootstrap.Replace('__GITHUB_RAW__', $GithubRaw)
$bootstrap = $bootstrap.Replace(([string][char]13+[string][char]10),[string][char]10)
$payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bootstrap))
$remoteCommand = "printf '%s' '$payload' | base64 -d | bash"
Write-Host 'Tencent may show one WeChat QR. Verify the server before approving login.'
& ssh.exe -tt -p 22 -o StrictHostKeyChecking=ask -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 $Server $remoteCommand
if ($LASTEXITCODE -ne 0) {
    throw ('SSH/install stage failed. Exit code: ' + $LASTEXITCODE + '. Keep the gateway disabled.')
}
Write-Host ('Finished: ' + $Mode)

if ($Mode -eq 'Install') {
    # Test actual Windows external route using its ordinary certificate trust
    # store. This does not authorize or retrieve a private PDF.
    $Url = 'https://pdf.gczhouwld.com/_pdf_gateway_health'
    $Stopwatch = [Diagnostics.Stopwatch]::StartNew()
    try {
        $Response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 12 -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop -Headers @{ Origin = 'https://gallery.gczhouwld.com'; 'Cache-Control' = 'no-cache' }
        $Data = $Response.Content | ConvertFrom-Json -ErrorAction Stop
        $AllowedOrigin = [string]$Response.Headers['Access-Control-Allow-Origin']
        if ($Response.StatusCode -ne 200 -or $Data.ok -ne $true -or
            $Data.role -ne 'private-pdf-ingress' -or $Data.authenticated -ne $false -or
            $AllowedOrigin -ne 'https://gallery.gczhouwld.com' -or
            $Response.BaseResponse.ResponseUri.AbsoluteUri -ne $Url) {
            throw 'Unexpected public gateway health response or CORS origin'
        }
        $Stopwatch.Stop()
        Write-Host ('[WINDOWS HTTPS PASS] Public health 200, CORS and trusted TLS. Elapsed=' + $Stopwatch.ElapsedMilliseconds + 'ms')
    }
    catch {
        Write-Warning ('[WINDOWS HTTPS FAIL] ' + $_.Exception.Message)
        throw 'Tencent gateway public acceptance failed from this Windows network. Leave Gallery routing DISABLED. Local gateway installation may already be complete; do not bypass certificate verification.'
    }
    # No account token, cookie, signed URL or real PDF is sent. Verify that
    # absent file tickets are rejected before the upstream PDF is requested.
    $Status = 0
    try {
        $Unused = Invoke-WebRequest -Uri 'https://pdf.gczhouwld.com/api/user-ui/private-pdf/file' -Method Get -TimeoutSec 12 -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
        $Status = [int]$Unused.StatusCode
    }
    catch {
        if ($_.Exception.Response) { $Status = [int]$_.Exception.Response.StatusCode }
        else { throw 'Unable to verify that unauthenticated file access is blocked.' }
    }
    if ($Status -ne 401) { throw 'Unauthenticated PDF-file rejection not proven. Leave Gallery routing DISABLED.' }
    Write-Host '[WINDOWS SECURITY PASS] Unauthenticated PDF file request returned 401.'
    Write-Host '[NEXT] Do not enable routing yet. Owner-only 206 Range, account isolation, real Edge and China-network acceptance remain.'
}
