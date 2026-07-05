@echo off
title Smart Salinity Ingress Advisor
color 0B
cls
echo.
echo  ============================================================
echo   🌊  Smart Salinity Ingress Advisor
echo       Gujarat Coastal Farmland Protection - IBM watsonx.ai
echo  ============================================================
echo.
echo  [1/3] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: Node.js not found. Download from https://nodejs.org
    pause
    exit /b 1
)
echo  ✓ Node.js found

echo.
echo  [2/3] Checking dependencies...
if not exist "node_modules\express" (
    echo  Installing dependencies...
    npm install
    if errorlevel 1 (
        color 0C
        echo  ERROR: npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
)
echo  ✓ Dependencies ready

echo.
echo  [3/3] Starting server...
echo.
echo  ============================================================
echo   Dashboard  : http://localhost:3000
echo   API Health : http://localhost:3000/api/health
echo   AI Model   : ibm/granite-3-8b-instruct
echo   Districts  : Kutch ^| Jamnagar ^| Bhavnagar
echo  ============================================================
echo.
echo  Opening browser in 3 seconds...
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after 3 second delay in background
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start server
node server.js

echo.
echo  Server stopped.
pause
