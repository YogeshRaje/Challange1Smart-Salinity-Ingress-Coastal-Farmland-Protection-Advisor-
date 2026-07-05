@echo off
title Installing Salinity Advisor Dependencies
color 0B
cls
echo.
echo  ============================================================
echo   Smart Salinity Ingress Advisor - First Time Setup
echo  ============================================================
echo.
echo  This will install all required Node.js packages.
echo.

node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org  (download LTS version)
    echo.
    pause
    exit /b 1
)

for /f %%v in ('node --version') do echo  ✓ Node.js %%v detected
echo.
echo  Installing packages (this may take 1-2 minutes)...
echo.
npm install
if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Installation failed. Check internet connection and try again.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   ✓ Installation complete!
echo  ============================================================
echo.
echo  Next steps:
echo    1. Make sure your IBM watsonx.ai credentials are in .env
echo    2. Double-click START.bat to launch the application
echo    3. Browser will open automatically at http://localhost:3000
echo.
pause
