# SAE Star Atlas Explorer - Backup Script (PowerShell)
# Questo script crea backup automatici del repository

Write-Host "🚀 SAE Star Atlas Explorer - Backup Script" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

# Data corrente
$Date = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupBranch = "backup_$Date"

# Verifica se ci sono modifiche non committate
$Status = git status --porcelain
if ($Status) {
    Write-Host "📋 Trovate modifiche non committate. Aggiunta al git..." -ForegroundColor Yellow
    git add .
    $CommitMsg = Read-Host "💬 Inserisci messaggio del commit"
    git commit -m $CommitMsg
}

# Crea branch di backup
Write-Host "💾 Creazione branch di backup: $BackupBranch" -ForegroundColor Cyan
git branch $BackupBranch

# Crea tag con timestamp
$Tag = "backup_v$Date"
Write-Host "🏷️  Creazione tag: $Tag" -ForegroundColor Magenta
git tag -a $Tag -m "Backup automatico del $Date"

# Mostra stato
Write-Host ""
Write-Host "✅ Backup completato!" -ForegroundColor Green
Write-Host "📊 Branch creato: $BackupBranch" -ForegroundColor Cyan
Write-Host "🏷️  Tag creato: $Tag" -ForegroundColor Magenta
Write-Host ""

Write-Host "📋 Lista backup recenti:" -ForegroundColor Yellow
git branch --list "backup_*" | Select-Object -Last 5

Write-Host ""
Write-Host "🏷️  Lista tag backup:" -ForegroundColor Yellow  
git tag --list "backup_*" | Select-Object -Last 5

Write-Host ""
Write-Host "💡 Per ripristinare un backup usa:" -ForegroundColor Cyan
Write-Host "   git checkout $BackupBranch" -ForegroundColor White
Write-Host "   oppure: git checkout $Tag" -ForegroundColor White

Read-Host "Premi Enter per continuare..."