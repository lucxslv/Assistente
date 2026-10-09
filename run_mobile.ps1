# Charlie Mobile Platform (Expo Go SDK 57) - PowerShell Runner
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "         CHARLIE MOBILE PLATFORM (EXPO GO SDK 57)        " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Detecta IP LAN fisico
Write-Host "[1/4] Detectando IP da interface física de rede..." -ForegroundColor Yellow
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notmatch '^(127\.|169\.254\.|192\.168\.56\.|172\.)' -and
    $_.InterfaceAlias -notmatch 'Virtual|vEthernet|Loopback'
} | Select-Object -ExpandProperty IPAddress -First 1)

if (-not $LanIp) {
    $LanIp = "192.168.0.190"
}

Write-Host "      - IP LAN Detectado: $LanIp" -ForegroundColor Green
Write-Host "      - Metro Bundler URL: exp://$LanIp:8081" -ForegroundColor Gray
Write-Host "      - Charlie API URL:   http://$LanIp:8005/api" -ForegroundColor Gray

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanIp
$env:EXPO_PUBLIC_API_URL = "http://$LanIp:8005/api"

# 2. Libera porta 8081 se estiver ocupada
Write-Host "`n[2/4] Verificando porta 8081 do Metro..." -ForegroundColor Yellow
$metroPids = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pidToKill in $metroPids) {
    Write-Host "      - Encerrando processo anterior na 8081 (PID $pidToKill)..." -ForegroundColor DarkYellow
    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
}

# 3. Garante que o backend Python esteja ativo na porta 8005
Write-Host "`n[3/4] Verificando backend Charlie API na porta 8005..." -ForegroundColor Yellow
$apiConn = Get-NetTCPConnection -LocalPort 8005 -State Listen -ErrorAction SilentlyContinue
if (-not $apiConn) {
    Write-Host "      - Backend nao detectado. Iniciando Charlie API (porta 8005)..." -ForegroundColor Yellow
    $pythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    if (Test-Path $pythonExe) {
        Start-Process cmd -ArgumentList "/c set HOST=0.0.0.0&& set PORT=8005&& `"$pythonExe`" -m uvicorn api.main:app --host 0.0.0.0 --port 8005" -WindowStyle Minimized
    } else {
        Start-Process cmd -ArgumentList "/c set HOST=0.0.0.0&& set PORT=8005&& uv run python -m uvicorn api.main:app --host 0.0.0.0 --port 8005" -WindowStyle Minimized
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "      - Charlie API ativa e respondendo na porta 8005." -ForegroundColor Green
}

# 4. Inicia o Metro Bundler
Write-Host "`n[4/4] Iniciando Metro Bundler..." -ForegroundColor Yellow
Set-Location (Join-Path $ProjectRoot "mobile")

param(
    [switch]$Tunnel,
    [switch]$Web
)

if ($Tunnel) {
    Write-Host "`nIniciando Expo Go em modo Tunel (Ngrok)...`n" -ForegroundColor Cyan
    npx expo start --go --tunnel -c
} elseif ($Web) {
    Write-Host "`nIniciando em modo Web...`n" -ForegroundColor Cyan
    npx expo start --web
} else {
    Write-Host "`nIniciando Expo Go em modo LAN (exp://$LanIp:8081)...`n" -ForegroundColor Cyan
    npx expo start --go -c
}
