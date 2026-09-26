@echo off
REM ==========================================================================
REM  AutoCare Chain Dashboard - double-click to start.
REM  Opens http://localhost:4000 in your browser.
REM  Keep this window open while you use the app. Close it to stop the app.
REM ==========================================================================
title AutoCare Chain Dashboard - keep this window open
cd /d "%~dp0"

REM Pick the Node.js that matches this computer (64-bit or 32-bit Windows).
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"
set "NODE=%~dp0node\%ARCH%\node.exe"

if not exist "%NODE%" goto :not_extracted
if not exist "%~dp0app\backend\src\server.js" goto :not_extracted

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
