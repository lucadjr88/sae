# SA Explorer - Script di Avvio Server
# Questo script configura l'ambiente, fa il build e avvia il server

Write-Host "`n*** SA Explorer - Avvio Server ***" -ForegroundColor Cyan
Write-Host ("=" * 50) -ForegroundColor Cyan

# 1. Configura cache esterna (fuori dal repo)
$cacheDir = Join-Path $env:LOCALAPPDATA "sa-explorer\cache"
$env:SA_CACHE_DIR = $cacheDir
Write-Host "`n[Cache] Configurata: $cacheDir" -ForegroundColor Green

# 2. Verifica che siamo nella directory corretta
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
Write-Host "[Dir] Directory progetto: $scriptDir" -ForegroundColor Green

# 3. Build del progetto TypeScript
Write-Host "`n[Build] Building TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRORE] Build fallito!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Build completato con successo" -ForegroundColor Green

# 4. Messaggio di attesa
Write-Host "`n[Ready] Server pronto per avvio" -ForegroundColor Cyan
Write-Host "`nPremi INVIO quando sei pronto ad avviare il server..." -ForegroundColor Yellow
Read-Host

# 5. Avvia il server
Write-Host "`n[Server] Avvio server in corso..." -ForegroundColor Cyan
Write-Host "   Cache: $env:SA_CACHE_DIR" -ForegroundColor Gray
Write-Host "   Port: 3000" -ForegroundColor Gray
Write-Host "   Per fermare il server: Ctrl+C" -ForegroundColor Gray
Write-Host ""

npm start
