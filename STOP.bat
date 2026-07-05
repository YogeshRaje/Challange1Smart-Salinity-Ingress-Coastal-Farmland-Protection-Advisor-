@echo off
title Stopping Salinity Advisor
echo.
echo  Stopping Smart Salinity Ingress Advisor on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo  Killing process %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo  ✓ Server stopped.
timeout /t 2 /nobreak >nul
