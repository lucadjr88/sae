# 🔒 SAE Star Atlas Explorer - Sistema di Backup

Questo repository include un sistema di backup completo per preservare il codice e le modifiche.

## 📋 Struttura Backup

### Branch
- `master` - Branch principale di sviluppo
- `backup-YYYYMMDD` - Branch di backup giornalieri  
- `backup_YYYYMMDD_HHMMSS` - Branch di backup automatici

### Tag
- `v1.0.0` - Versione stabile con funzionalità SAGE fees
- `backup_vYYYYMMDD_HHMMSS` - Tag di backup temporali

## 🚀 Come Fare Backup

### Automatico (Raccomandato)
```powershell
# Windows PowerShell
.\backup.ps1

# Bash/Git Bash
./backup.sh
```

### Manuale
```bash
# Aggiungi modifiche
git add .
git commit -m "Descrizione modifiche"

# Crea backup con data
git branch backup_$(date +%Y%m%d_%H%M%S)
git tag -a backup_v$(date +%Y%m%d_%H%M%S) -m "Backup manuale"
```

## 📚 Comandi Utili

### Visualizzare Backup
```bash
# Lista tutti i branch backup
git branch --list "backup_*"

# Lista tutti i tag backup  
git tag --list "backup_*"

# Storia dei commit
git log --oneline -10
```

### Ripristinare da Backup
```bash
# Ripristina da branch backup
git checkout backup_20251112

# Ripristina da tag
git checkout backup_v20251112_143022

# Torna al master
git checkout master
```

### Pulizia Backup Vecchi
```bash
# Elimina branch backup più vecchi di 30 giorni
git branch --list "backup_*" | head -n -10 | xargs -r git branch -d

# Elimina tag backup più vecchi
git tag --list "backup_*" | head -n -10 | xargs -r git tag -d
```

## 🔄 Backup Strategy

1. **Backup automatici**: Prima di modifiche importanti
2. **Backup manuali**: Fine giornata o milestone
3. **Tag versioni**: Per release stabili
4. **Branch feature**: Per sviluppo di nuove funzionalità

## 📊 Status Attuale

- ✅ Repository inizializzato
- ✅ Gitignore configurato
- ✅ Backup script creati
- ✅ Prima versione (v1.0.0) taggata
- ✅ Funzionalità SAGE fees operative

## 🛡️ Sicurezza

- Tutti i file sensibili sono in .gitignore
- Backup multipli per ridondanza
- Tag immutabili per versioni stabili
- Branch separati per esperimenti