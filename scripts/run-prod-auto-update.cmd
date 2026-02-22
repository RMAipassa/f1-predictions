@echo off
setlocal

cd /d "%~dp0.."

REM Runs the standalone server and auto-pulls updates.
REM Requires: git in PATH and an upstream branch configured.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-prod-auto-update.ps1"
