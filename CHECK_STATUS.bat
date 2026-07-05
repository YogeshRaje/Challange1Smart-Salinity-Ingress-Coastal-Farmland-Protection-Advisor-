@echo off
title Salinity Advisor - Status Check
color 0B
cls
echo.
echo  ============================================================
echo   Smart Salinity Ingress Advisor - Status Check
echo  ============================================================
echo.

:: Check Node.js
echo  Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  ✗ Node.js: NOT INSTALLED
) else (
    for /f %%v in ('node --version') do echo  ✓ Node.js: %%v
)

:: Check npm
echo.
echo  Checking npm packages...
if exist "node_modules\express" (
    echo  ✓ express: installed
) else (
    echo  ✗ express: MISSING - run npm install
)
if exist "node_modules\@ibm-cloud" (
    echo  ✓ @ibm-cloud/watsonx-ai: installed
) else (
    echo  ✗ @ibm-cloud/watsonx-ai: MISSING - run npm install
)

:: Check .env
echo.
echo  Checking .env credentials...
if exist ".env" (
    echo  ✓ .env file: found
    node -e "require('dotenv').config(); console.log('  API Key:    ' + (process.env.WATSONX_API_KEY && process.env.WATSONX_API_KEY !== 'your_ibm_watsonx_api_key_here' ? '✓ SET' : '✗ NOT SET')); console.log('  Project ID: ' + (process.env.WATSONX_PROJECT_ID && process.env.WATSONX_PROJECT_ID !== 'your_watsonx_project_id_here' ? '✓ SET' : '✗ NOT SET')); console.log('  Model:      ' + (process.env.WATSONX_MODEL_ID || 'ibm/granite-3-8b-instruct')); console.log('  Port:       ' + (process.env.PORT || 3000));"
) else (
    echo  ✗ .env file: MISSING - copy .env.example to .env and fill credentials
)

:: Check if server is running
echo.
echo  Checking if server is running on port 3000...
netstat -an 2>nul | find ":3000" | find "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo  - Server: NOT RUNNING
) else (
    echo  ✓ Server: RUNNING at http://localhost:3000
)

:: Check IBM watsonx connectivity
echo.
echo  Checking IBM watsonx.ai connectivity...
node -e "require('dotenv').config(); const w = require('./services/watsonxService'); w.healthCheck().then(r => console.log('  ✓ IBM watsonx.ai: ' + r.status + ' (' + r.model + ')')).catch(e => console.log('  ✗ IBM watsonx.ai: ' + e.message));" 2>nul

echo.
echo  ============================================================
echo  To start: double-click START.bat
echo  To stop:  double-click STOP.bat  or  press Ctrl+C in server window
echo  ============================================================
echo.
pause
