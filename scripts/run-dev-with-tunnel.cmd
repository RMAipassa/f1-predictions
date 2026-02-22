@echo off
setlocal

REM Runs the app in dev mode on port 3210 and starts cloudflared using your config.yml.

cd /d "%~dp0.."

set PORT=3210
set HOSTNAME=0.0.0.0
set ENABLE_BACKGROUND_JOBS=1

echo.
echo Starting Next dev server on http://localhost:%PORT% ...
start "F1 Predictions (dev)" cmd /k "npm run dev"

echo.
echo Starting cloudflared tunnel using %USERPROFILE%\.cloudflared\config.yml ...
start "cloudflared" cmd /k "cloudflared tunnel --config \"%USERPROFILE%\\.cloudflared\\config.yml\" run"

echo.
echo Open locally:  http://localhost:%PORT%
echo Public URL should be: https://f1.rubyruben.nl
echo.
pause
