@echo off
REM ==========================================================================
REM  AutoCare Chain Dashboard - Windows starter
REM  Double-click this file. It installs what is needed (first time only),
REM  starts the app, and opens it in your browser at http://localhost:4000
REM  Keep this window open while you use the app. Close it to stop the app.
REM ==========================================================================
title AutoCare Chain Dashboard
cd /d "%~dp0"

echo.
echo  AutoCare Chain Dashboard
echo  ------------------------
echo.

REM --- 1. Is Node.js installed? ---
where node >nul 2>nul
if errorlevel 1 goto :no_node

REM --- 2. Is it new enough? Needs 20.19+ or 22.12+ ---
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>=23?0:1)"
if errorlevel 1 goto :old_node

REM --- 3. Install dependencies, first run only ---
if exist "backend\node_modules\express" if exist "frontend\node_modules\vite" goto :build
echo  Installing, first time only. This can take a few minutes...
echo.
call npm install
if errorlevel 1 goto :failed

:build
REM --- 4. Build the website ---
echo.
echo  Preparing the website...
call npm run build
if errorlevel 1 goto :failed

REM --- 5. Open the browser a few seconds after the server starts ---
start "" /min cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:4000"

echo.
echo  ==========================================================
echo   The app is running. Keep this window open.
echo.
echo   Booking form:  http://localhost:4000
echo   Admin panel:   http://localhost:4000/admin
echo.
echo   To stop the app, close this window.
echo  ==========================================================
echo.
call npm start --prefix backend
echo.
echo  The app stopped. If you see an error above, send a screenshot of it.
pause
exit /b 0

:no_node
echo  Node.js is not installed on this computer.
echo.
echo  1. The download page will open now. Download the "LTS" version and install it.
echo  2. Then double-click START-WINDOWS.bat again.
echo.
start https://nodejs.org/en/download
pause
exit /b 1

:old_node
for /f %%v in ('node -v') do set NODE_VER=%%v
echo  Your Node.js version is %NODE_VER%, which is too old.
echo  Install the "LTS" version from the page that opens now, then run this file again.
echo.
start https://nodejs.org/en/download
pause
exit /b 1

:failed
echo.
echo  Something went wrong. Please send a screenshot of this window.
pause
exit /b 1
