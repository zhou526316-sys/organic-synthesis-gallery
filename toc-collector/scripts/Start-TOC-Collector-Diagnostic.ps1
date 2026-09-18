[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AppArgument = @()
)

$ErrorActionPreference = 'Stop'
$executable = Join-Path $PSScriptRoot 'Organic Synthesis Gallery TOC Collector.exe'
$launchLog = Join-Path $PSScriptRoot 'toc-collector-launch.log'
$bootstrapLog = Join-Path ([IO.Path]::GetTempPath()) 'toc-collector-bootstrap.log'
$capture = $null
$gate = $null
$child = $null
$exitCode = 1

function Write-Bootstrap([string]$Message) {
    try {
        [IO.File]::AppendAllText($bootstrapLog, ('{0:o} [native diagnostic] {1}{2}' -f [DateTime]::UtcNow, $Message, [Environment]::NewLine))
    } catch {
        Write-Warning ('Bootstrap log unavailable: {0}' -f $_.Exception.Message)
    }
}

function Quote-Argument([string]$Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    return '"' + (($Value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}

function Write-LaunchLog([string]$Message) {
    $line = '{0:o} [launcher] {1}' -f [DateTime]::UtcNow, $Message
    [TocCollectorDiagnosticCapture]::WriteLine($capture, $gate, $line)
    Write-Host $Message
    Write-Bootstrap $Message
}

Write-Bootstrap 'NATIVE_LAUNCH_ENTRY (before Electron)'
try {
    # Drain both pipes concurrently, serializing each write to one append-only log.
    # This avoids pipe deadlocks and two writers truncating or corrupting the file.
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
public static class TocCollectorDiagnosticCapture {
    public static async Task CopyAsync(Stream source, Stream destination, SemaphoreSlim gate) {
        byte[] buffer = new byte[8192];
        int count;
        while ((count = await source.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) > 0) {
            await gate.WaitAsync().ConfigureAwait(false);
            try {
                await destination.WriteAsync(buffer, 0, count).ConfigureAwait(false);
                await destination.FlushAsync().ConfigureAwait(false);
            } finally { gate.Release(); }
        }
    }
    public static void WriteLine(Stream destination, SemaphoreSlim gate, string message) {
        byte[] bytes = Encoding.UTF8.GetBytes(Environment.NewLine + message + Environment.NewLine);
        gate.Wait();
        try {
            destination.Write(bytes, 0, bytes.Length);
            destination.Flush();
        } finally { gate.Release(); }
    }
}
'@
    $capture = [IO.File]::Open($launchLog, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
    $gate = New-Object System.Threading.SemaphoreSlim(1, 1)
    Write-LaunchLog ('Starting EXE: {0}' -f $executable)
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw 'The application EXE is missing. Extract the entire ZIP and keep this launcher beside the EXE.'
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $executable
    $startInfo.WorkingDirectory = $PSScriptRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables['ELECTRON_ENABLE_LOGGING'] = '1'
    $startInfo.EnvironmentVariables['ELECTRON_ENABLE_STACK_DUMPING'] = '1'
    $startInfo.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
    $arguments = @('--enable-logging=stderr', '--v=1') + $AppArgument
    $startInfo.Arguments = ($arguments | ForEach-Object { Quote-Argument $_ }) -join ' '
    $child = New-Object System.Diagnostics.Process
    $child.StartInfo = $startInfo
    if (-not $child.Start()) { throw 'Windows did not create an Electron process.' }
    Write-LaunchLog ('PROCESS_CREATED pid={0}' -f $child.Id)
    $stdoutTask = [TocCollectorDiagnosticCapture]::CopyAsync($child.StandardOutput.BaseStream, $capture, $gate)
    $stderrTask = [TocCollectorDiagnosticCapture]::CopyAsync($child.StandardError.BaseStream, $capture, $gate)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $runningReported = $false
    $windowReported = $false
    while (-not $child.WaitForExit(250)) {
        $child.Refresh()
        if (-not $windowReported -and $child.MainWindowHandle -ne [IntPtr]::Zero) {
            Write-LaunchLog ('WINDOW_OBSERVED handle={0} title={1}' -f $child.MainWindowHandle, $child.MainWindowTitle)
            $windowReported = $true
        }
        if (-not $runningReported -and $timer.Elapsed.TotalSeconds -ge 15) {
            Write-LaunchLog 'TOC Collector is running (process alive for more than 15 seconds).'
            if (-not $windowReported) { Write-LaunchLog 'No main window has been observed yet; inspect the bootstrap log.' }
            $runningReported = $true
        }
    }
    $stdoutTask.GetAwaiter().GetResult()
    $stderrTask.GetAwaiter().GetResult()
    $exitCode = $child.ExitCode
    Write-LaunchLog ('PROCESS_EXIT exit code={0} windowObserved={1}' -f $exitCode, $windowReported)
} catch {
    $launchError = $_.Exception.Message
    if ($child) {
        try {
            if (-not $child.HasExited) {
                $child.Kill($true)
                [void]$child.WaitForExit(5000)
            }
        } catch {
            Write-Bootstrap ('CHILD_CLEANUP_FAILED: {0}' -f $_.Exception.Message)
        }
    }
    $message = 'LAUNCH_FAILED: {0}' -f $launchError
    if ($capture -and $gate) { Write-LaunchLog $message }
    else { Write-Bootstrap $message; Write-Host $message }
    Write-Host ('Bootstrap log: {0}' -f $bootstrapLog)
    $exitCode = 1
} finally {
    if ($child) { $child.Dispose() }
    if ($capture) { $capture.Dispose() }
    if ($gate) { $gate.Dispose() }
}
exit $exitCode
