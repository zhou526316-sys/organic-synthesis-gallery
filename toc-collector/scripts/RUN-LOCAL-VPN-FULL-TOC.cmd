@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-LOCAL-VPN-FULL-TOC.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Local VPN TOC scan exited with code %RC%.
pause
exit /b %RC%
