@echo off
echo ========================================================
echo   Inicializando Charlie Web Chat (Frontend Standalone)
echo ========================================================
cd /d "%~dp0"

echo Verificando dependencias...
if not exist "node_modules\" (
    echo Instalando dependencias do projeto...
    call npm install
)

echo Iniciando servidor de desenvolvimento Vite...
call npm run dev
