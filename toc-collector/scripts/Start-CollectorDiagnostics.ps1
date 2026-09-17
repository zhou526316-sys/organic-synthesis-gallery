[CmdletBinding()]
param(
    [switch]$Development,
    [string]$ExecutablePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AppArgument = @()
)

$ErrorActionPreference = 'Stop'
$bootstrapPath = Join-Path ([IO.Path]::GetTempPath()) 'toc-collector-bootstrap.log'
function Write-Bootstrap([string]$Message) {
    [IO.File]::AppendAllText($bootstrapPath, ('[{0:o}] [native powershell] {1}{2}' -f [DateTime]::UtcNow, $Message, [Environment]::NewLine))
}

# CommandLineToArgvW-compatible quoting, including paths ending in a backslash.
function Quote-Argument([string]$Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    return '"' + (($Value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}

Write-Bootstrap 'launcher-enter (Electron has not been loaded)'
try {
    if ($Development) {
        $projectPath = Split-Path -Parent $PSScriptRoot
        $ExecutablePath = Join-Path $projectPath 'node_modules\electron\dist\electron.exe'
        $AppArgument = @($projectPath) + $AppArgument
    } elseif (-not $ExecutablePath) {
        $ExecutablePath = Join-Path $PSScriptRoot 'Organic Synthesis Gallery TOC Collector.exe'
    }
    $resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath).Path
    $stdoutPath = Join-Path ([IO.Path]::GetTempPath()) ('toc-collector-stdout-{0}.log' -f $PID)
    $stderrPath = Join-Path ([IO.Path]::GetTempPath()) ('toc-collector-stderr-{0}.log' -f $PID)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $resolvedExecutable
    $startInfo.WorkingDirectory = Split-Path -Parent $resolvedExecutable
    $startInfo.UseShellExecute = $false
    $startInfo.Arguments = ($AppArgument | ForEach-Object { Quote-Argument $_ }) -join ' '
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    if ($startInfo.EnvironmentVariables.ContainsKey('ELECTRON_RUN_AS_NODE')) {
        Write-Bootstrap 'removing inherited ELECTRON_RUN_AS_NODE for this child only'
        $startInfo.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
    }
    Write-Bootstrap ('electron-launch-before executable={0} stdout={1} stderr={2}' -f $resolvedExecutable, $stdoutPath, $stderrPath)
    $child = New-Object System.Diagnostics.Process
    $child.StartInfo = $startInfo
    if (-not $child.Start()) { throw 'Windows did not create an Electron process.' }
    Write-Bootstrap ('electron-process-created pid={0}' -f $child.Id)
    $output = [IO.File]::Open($stdoutPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
    $errors = [IO.File]::Open($stderrPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
    try {
        $stdoutTask = $child.StandardOutput.BaseStream.CopyToAsync($output)
        $stderrTask = $child.StandardError.BaseStream.CopyToAsync($errors)
        $windowLogged = $false
        while (-not $child.WaitForExit(1000)) {
            $child.Refresh()
            if (-not $windowLogged -and $child.MainWindowHandle -ne [IntPtr]::Zero) {
                Write-Bootstrap ('native-window-observed pid={0} handle={1} title={2}' -f $child.Id, $child.MainWindowHandle, $child.MainWindowTitle)
                $windowLogged = $true
            }
        }
        $stdoutTask.GetAwaiter().GetResult()
        $stderrTask.GetAwaiter().GetResult()
        $exitCode = $child.ExitCode
        Write-Bootstrap ('electron-exit code={0} windowObserved={1}' -f $exitCode, $windowLogged)
    } finally {
        $output.Dispose()
        $errors.Dispose()
        $child.Dispose()
    }
    Write-Host ('Collector exited with code {0}. Diagnostics: {1}' -f $exitCode, $bootstrapPath)
    exit $exitCode
} catch {
    Write-Bootstrap ('launcher-failed {0}' -f $_.Exception.Message)
    Write-Error ('TOC Collector could not start. See {0}. {1}' -f $bootstrapPath, $_.Exception.Message) -ErrorAction Continue
    exit 1
}
