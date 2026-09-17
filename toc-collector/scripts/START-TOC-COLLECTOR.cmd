@echo off
setlocal
chcp 65001 >nul
echo [TOC Collector] Preparing downloaded files and starting the app...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-TOC-Collector-Unblock.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] TOC Collector could not start. Error code: %RC%
  echo See %%TEMP%%\toc-collector-bootstrap.log
  pause
  exit /b %RC%
)
exit /b 0
