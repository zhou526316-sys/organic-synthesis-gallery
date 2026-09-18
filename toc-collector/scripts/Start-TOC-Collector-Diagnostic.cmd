@echo off
setlocal
title TOC Collector Diagnostic
set "ELECTRON_ENABLE_LOGGING=1"
set "ELECTRON_ENABLE_STACK_DUMPING=1"
set "ELECTRON_RUN_AS_NODE="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-TOC-Collector-Diagnostic.ps1" %*
set "TOC_EXIT_CODE=%ERRORLEVEL%"
echo.
echo Diagnostic launcher exit code: %TOC_EXIT_CODE%
echo Log: "%~dp0toc-collector-launch.log"
pause
exit /b %TOC_EXIT_CODE%
