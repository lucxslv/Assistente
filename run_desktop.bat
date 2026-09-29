@echo off
title Charlie Desktop Platform
echo ===================================================
echo           Iniciando Charlie Desktop (Tauri)
echo ===================================================

:: Garante que o diretorio atual seja a raiz do projeto
cd /d "%~dp0"

:: Garante MinGW GCC e Python uv no PATH
set "PATH=C:\msys64\mingw64\bin;C:\Users\%USERNAME%\.local\bin;%PATH%"

:: Libera a porta 8005 caso algum processo anterior tenha ficado travado em background
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8005 ^| findstr LISTENING') do (
    echo [Info] Liberando porta 8005 do processo PID %%a
    taskkill /f /pid %%a >nul 2>&1
)

:: Libera a porta 1420 do Vite e processos desktop anteriores caso tenham ficado travados
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
taskkill /f /im desktop.exe >nul 2>&1

echo [1/2] Iniciando Charlie Modular API (Porta 8005)...
start "Charlie Modular API" cmd /c "uv run python -m api.main || pause"

echo [Aguardando API inicializar...]
ping -n 3 127.0.0.1 >nul

echo [2/2] Iniciando App Desktop (Tauri + React)...
cd desktop
call npm run tauri dev

:: Ao fechar a janela do app desktop, encerra o servidor backend em segundo plano
echo [Info] Encerrando Charlie API de segundo plano...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8005 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

