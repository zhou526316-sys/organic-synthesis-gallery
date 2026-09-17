@echo off
setlocal
chcp 65001 >nul
set "TOC_ROOT=%~dp0"
if not exist "%TOC_ROOT%Organic Synthesis Gallery TOC Collector.exe" set "TOC_ROOT=%~dp0..\"
cd /d "%TOC_ROOT%"

echo [TOC Collector] Removing download Zone.Identifier markers from this app folder...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=[IO.Path]::GetFullPath($env:TOC_ROOT); Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue ^| ForEach-Object { try { Unblock-File -LiteralPath $_.FullName -ErrorAction Stop } catch {} }"

set "TOC_EXE=%TOC_ROOT%Organic Synthesis Gallery TOC Collector.exe"
if not exist "%TOC_EXE%" (
  echo [ERROR] Collector EXE not found:
  echo %TOC_EXE%
  pause
  exit /b 2
)

echo [TOC Collector] Starting...
start "" "%TOC_EXE%"
if errorlevel 1 (
  echo [ERROR] Windows could not start TOC Collector.
  echo Please check %%TEMP%%\toc-collector-bootstrap.log
  pause
  exit /b 3
)

exit /b 0
