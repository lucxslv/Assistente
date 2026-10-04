@echo off
echo ==============================================
echo Adicionando Charlie na Inicializacao do Windows
echo ==============================================

set SCRIPT_DIR=%~dp0
set VBS_PATH=%SCRIPT_DIR%iniciar_charlie.vbs
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\Charlie.lnk

if not exist "%VBS_PATH%" (
    echo [ERRO] iniciar_charlie.vbs nao encontrado na pasta %SCRIPT_DIR%
    pause
    exit /b 1
)

echo Criando atalho no Startup...
powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $shortcut = $wshell.CreateShortcut('%SHORTCUT_PATH%'); $shortcut.TargetPath = '%VBS_PATH%'; $shortcut.WorkingDirectory = '%SCRIPT_DIR%'; $shortcut.Save()"

echo.
echo [SUCESSO] O Charlie ira iniciar automaticamente em segundo plano na proxima inicializacao!
echo.
pause
