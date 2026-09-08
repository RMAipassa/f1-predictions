@echo off
setlocal

cd /d "%~dp0.."

REM Runs the standalone server and auto-pulls updates.
REM Requires: git in PATH and an upstream branch configured.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-prod-auto-update.ps1"

if errorlevel 1 (
  echo.
  echo Production launcher failed. Review the error above and the logs in:
  echo %LOCALAPPDATA%\F1Predictions\data\logs
  pause
)
