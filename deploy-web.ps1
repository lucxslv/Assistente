# deploy-web.ps1
# Sincroniza e faz deploy da pasta web-chat diretamente para o repositório lucxslv/Web-Charlie (Vercel)

Write-Host "=== Charlie Web Deploy ===" -ForegroundColor Cyan
Write-Host "Isolando commits da pasta web-chat..." -ForegroundColor Yellow

$branchExists = git branch --list web-chat-deploy
if ($branchExists) {
    git branch -D web-chat-deploy | Out-Null
}

git subtree split --prefix=web-chat -b web-chat-deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao gerar subtree split de web-chat." -ForegroundColor Red
    exit 1
}

Write-Host "Enviando para https://github.com/lucxslv/Web-Charlie.git (main)..." -ForegroundColor Yellow
git push web-charlie web-chat-deploy:main --force
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao enviar para o repositório remoto web-charlie." -ForegroundColor Red
    exit 1
}

Write-Host "SUCESSO: Deploy do Web Charlie disparado na Vercel!" -ForegroundColor Green
Write-Host "Acompanhe em: https://web-charlie.vercel.app" -ForegroundColor Cyan
