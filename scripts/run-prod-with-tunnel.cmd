@echo off
setlocal

REM Builds + runs the standalone production server on port 3210.
REM (Tunnel is managed separately by you.)

cd /d "%~dp0.."

set PORT=3210
set HOSTNAME=0.0.0.0
set ENABLE_BACKGROUND_JOBS=1

if not exist "node_modules\next\package.json" (
  echo.
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

echo.
echo Rebuilding native deps (better-sqlite3) for this Node...
call npm rebuild better-sqlite3

echo.
echo Building...
call npm run build
if errorlevel 1 exit /b 1

echo.
echo Starting standalone server on http://localhost:%PORT% ...
echo.
start "" "http://localhost:%PORT%/login"
node ".next\standalone\server.js"
