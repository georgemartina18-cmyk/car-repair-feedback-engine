@echo off
REM ==========================================================================
REM  AutoCare Chain Dashboard - double-click to start.
REM  Opens http://localhost:4000 in your browser.
REM  Keep this window open while you use the app. Close it to stop the app.
REM
REM  First run only: downloads Node.js (the engine the app runs on) from the
REM  official site nodejs.org into the "node" folder here, and checks its
REM  SHA-256 checksum. Nothing is installed on the computer itself.
REM ==========================================================================
title AutoCare Chain Dashboard - keep this window open
cd /d "%~dp0"

if not exist "%~dp0app\backend\src\server.js" goto :not_extracted

REM Pick the Node.js that matches this computer (64-bit or 32-bit Windows).
set "NODE_VERSION=v22.23.3"
set "ARCH=x64"
set "NODE_SHA=9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"
if "%ARCH%"=="x86" set "NODE_SHA=a8aa72dda43af5357d0a502548a54e402d4f7643be221662624a2cc876cd37bb"
set "NODE=%~dp0node\%ARCH%\node.exe"
set "NODE_TMP=%~dp0node\%ARCH%\node.download"
set "NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/win-%ARCH%/node.exe"

if exist "%NODE%" goto :run

echo.
echo  First-time setup: downloading the app engine (about 85 MB).
echo  This can take a few minutes. Please wait and do not close this window...
echo.
if not exist "%~dp0node\%ARCH%" mkdir "%~dp0node\%ARCH%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%NODE_URL%' -OutFile '%NODE_TMP%'; if ((Get-FileHash -Algorithm SHA256 -LiteralPath '%NODE_TMP%').Hash -ne '%NODE_SHA%') { Remove-Item -LiteralPath '%NODE_TMP%'; throw 'The download was damaged (checksum mismatch).' }; Move-Item -Force -LiteralPath '%NODE_TMP%' -Destination '%NODE%'"
if errorlevel 1 goto :download_failed
if not exist "%NODE%" goto :download_failed
echo  Download finished.

:run
echo.
echo  ==========================================================
echo    AutoCare Chain Dashboard is starting...
echo.
echo    Booking form:  http://localhost:4000
echo    Admin panel:   http://localhost:4000/admin
echo.
echo    KEEP THIS WINDOW OPEN while you use the app.
echo    To stop the app, close this window.
echo  ==========================================================
echo.

REM Open the browser a few seconds after the app starts.
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start "" http://localhost:4000"

"%NODE%" "%~dp0app\backend\src\server.js"

echo.
echo  The app has stopped. If you see an error above, take a screenshot of this window.
pause
exit /b 0

:download_failed
echo.
echo  The download did not work. Please check that this computer is connected
echo  to the internet, then close this window and double-click START-AutoCare.bat again.
echo  If it keeps failing, take a screenshot of this window.
echo.
pause
exit /b 1

:not_extracted
echo.
echo  The files are not unzipped yet.
echo.
echo  1. Close this window.
echo  2. Right-click the file AutoCare-Dashboard-Windows.zip and choose "Extract All...".
echo  3. Click "Extract".
echo  4. In the folder that opens, open "AutoCare-Dashboard" and double-click START-AutoCare.bat
echo.
pause
exit /b 1
