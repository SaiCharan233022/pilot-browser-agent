@echo off
title Pilot AI Browser Agent
echo ==========================================
echo    Starting Pilot AI Browser Agent...
echo ==========================================
echo.

cd /d "%~dp0"

:: Free up port 3000 if another process is using it
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue; if ($conns) { $conns | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }" >nul 2>&1

:: Start the server
node src/index.js
if %errorlevel% neq 0 (
    echo.
    echo ❌ Server exited with an error.
    pause
)
