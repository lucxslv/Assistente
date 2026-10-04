@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-web.ps1"
pause
