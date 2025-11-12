#!/bin/bash
# SAE Star Atlas Explorer - Backup Script
# Questo script crea backup automatici del repository

echo "🚀 SAE Star Atlas Explorer - Backup Script"
echo "==========================================="

# Data corrente
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_BRANCH="backup_$DATE"

# Verifica se ci sono modifiche non committate
if [[ -n $(git status --porcelain) ]]; then
    echo "📋 Trovate modifiche non committate. Aggiunta al git..."
    git add .
    read -p "💬 Inserisci messaggio del commit: " commit_msg
    git commit -m "$commit_msg"
fi

# Crea branch di backup
echo "💾 Creazione branch di backup: $BACKUP_BRANCH"
git branch $BACKUP_BRANCH

# Crea tag con timestamp
TAG="backup_v$DATE"
echo "🏷️  Creazione tag: $TAG"
git tag -a $TAG -m "Backup automatico del $DATE"

# Mostra stato
echo ""
echo "✅ Backup completato!"
echo "📊 Branch creato: $BACKUP_BRANCH"
echo "🏷️  Tag creato: $TAG"
echo ""
echo "📋 Lista backup recenti:"
git branch --list "backup_*" | tail -5
echo ""
echo "🏷️  Lista tag backup:"
git tag --list "backup_*" | tail -5

echo ""
echo "💡 Per ripristinare un backup usa:"
echo "   git checkout $BACKUP_BRANCH"
echo "   oppure: git checkout $TAG"