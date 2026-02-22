@echo off
setlocal

REM Builds + runs production server on port 3210 and starts cloudflared using your config.yml.

cd /d "%~dp0.."

set PORT=3210
set HOSTNAME=0.0.0.0
set ENABLE_BACKGROUND_JOBS=1

echo.
echo Building...
call npm run build
if errorlevel 1 exit /b 1

echo.
echo Starting Next production server on http://localhost:%PORT% ...
start "F1 Predictions (prod)" cmd /k "npm run start"

echo.
echo Starting cloudflared tunnel using %USERPROFILE%\.cloudflared\config.yml ...
start "cloudflared" cmd /k "cloudflared tunnel --config \"%USERPROFILE%\\.cloudflared\\config.yml\" run"

echo.
echo Open locally:  http://localhost:%PORT%
echo Public URL should be: https://f1.rubyruben.nl
echo.
pause
