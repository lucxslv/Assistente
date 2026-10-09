@echo off
setlocal enabledelayedexpansion
title Charlie Mobile Platform (Expo Go)
cls
echo ========================================================
echo          CHARLIE MOBILE PLATFORM (EXPO GO SDK 57)
echo ========================================================
echo.

:: Garante que o diretorio atual seja a raiz do projeto
cd /d "%~dp0"

:: 1. Detecta o IP real da interface de rede física (ignorando VirtualBox e Hyper-V)
echo [1/4] Detectando endereco IP da rede local (LAN)...
set "LAN_IP="
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { `$_.IPAddress -notmatch '^(127\.|169\.254\.|192\.168\.56\.|172\.)' -and `$_.InterfaceAlias -notmatch 'Virtual|vEthernet|Loopback' } | Select-Object -ExpandProperty IPAddress -First 1)"`) do set "LAN_IP=%%i"

if not defined LAN_IP (
    set "LAN_IP=192.168.0.190"
)

echo       - IP LAN detectado: !LAN_IP!
echo       - Metro Bundler URL: exp://!LAN_IP!:8081
echo       - Charlie API URL:   http://!LAN_IP!:8005/api

:: Configura o hostname obrigatorio para o Metro gerar o QR Code correto
set "REACT_NATIVE_PACKAGER_HOSTNAME=!LAN_IP!"
set "EXPO_PUBLIC_API_URL=http://!LAN_IP!:8005/api"

:: 2. Libera a porta 8081 do Metro caso algum processo anterior tenha ficado travado
echo.
echo [2/4] Verificando porta 8081 do Metro...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do (
    echo       - Liberando porta 8081 ocupada pelo PID %%a...
    taskkill /f /pid %%a >nul 2>&1
)

:: 3. Garante que o backend Python (FastAPI) na porta 8005 esteja ativo
echo.
echo [3/4] Verificando backend Charlie API (porta 8005)...
netstat -aon | findstr :8005 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo       - Charlie API nao detectada. Iniciando backend na porta 8005...
    set "HOST=0.0.0.0"
    set "PORT=8005"
    if exist "%~dp0.venv\Scripts\python.exe" (
        start "Charlie API (Porta 8005)" /min cmd /c "set HOST=0.0.0.0&& set PORT=8005&& "%~dp0.venv\Scripts\python.exe" -m uvicorn api.main:app --host 0.0.0.0 --port 8005"
    ) else (
        start "Charlie API (Porta 8005)" /min cmd /c "set HOST=0.0.0.0&& set PORT=8005&& uv run python -m uvicorn api.main:app --host 0.0.0.0 --port 8005"
    )
    echo       - Aguardando inicializacao da API...
    ping -n 3 127.0.0.1 >nul
) else (
    echo       - Charlie API ja ativa e respondendo na porta 8005.
)

:: 4. Processa argumentos de linha de comando ou escolha do modo
echo.
echo [4/4] Modo de Inicializacao:
set "MODE=lan"
if "%~1"=="--tunnel" set "MODE=tunnel"
if "%~1"=="tunnel" set "MODE=tunnel"
if "%~1"=="--web" set "MODE=web"
if "%~1"=="web" set "MODE=web"

if not "%MODE%"=="lan" (
    echo       - Modo selecionado por argumento: %MODE%
    goto INICIAR
)

echo   [1] Conexao Wi-Fi Local (Padrao - Ultra Rapido)
echo   [2] Conexao via Tunel Ngrok (Ideal se houver bloqueio de firewall ou AP Isolation)
echo   [3] Abrir no Navegador Web (Modo Web)
echo.
echo   Pressione [2] para Tunel, [3] para Web, ou Enter para continuar em Wi-Fi (3s):
choice /c 123 /n /t 3 /d 1 >nul 2>&1
if errorlevel 3 (
    set "MODE=web"
) else if errorlevel 2 (
    set "MODE=tunnel"
) else (
    set "MODE=lan"
)

:INICIAR
cd "%~dp0mobile"

echo.
echo ========================================================
if "%MODE%"=="tunnel" (
    echo  INICIANDO METRO EM MODO TUNEL (NGROK)...
    echo  Use o app Expo Go no celular para escanear o QR Code.
    echo ========================================================
    echo.
    call npx expo start --go --tunnel -c
) else if "%MODE%"=="web" (
    echo  INICIANDO EM MODO WEB...
    echo ========================================================
    echo.
    call npx expo start --web
) else (
    echo  INICIANDO METRO EM MODO LAN (IP: !LAN_IP!)...
    echo  Use o app Expo Go no celular (conectado ao mesmo Wi-Fi).
    echo ========================================================
    echo.
    call npx expo start --go -c
)

pause
