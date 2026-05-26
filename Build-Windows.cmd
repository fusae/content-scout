@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20 or newer first:
  echo https://nodejs.org/
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto failed

call npm run desktop:dist:win
if errorlevel 1 goto failed

echo.
echo Windows installer is ready in the release folder.
pause
exit /b 0

:failed
echo.
echo Build failed. Check the error above.
pause
exit /b 1
