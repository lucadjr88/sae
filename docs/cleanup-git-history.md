# Cleanup storia git per pubblicazione pubblica

## File da rimuovere dalla storia

### 1. `utility/rpc-pool-complete.json` e `utility/rpc-pool-complete-copy.json`
Contengono endpoint RPC con chiavi API reali (Helius, GetBlock, etc.).

**Azione:** Rimuovere da tutta la storia git.

### 2. File di log/debug
- `debugSae.txt`
- `debugSae2.txt`
- `docs/prompt.md`
- `docs/rentedDetails.md` (contiene endpoint Helius con key)
- `docs/get_fleet_info_minimal_api.md` (contiene endpoint Helius con key)
- `.continue/agents/new-config.yaml` (contiene Dify API key e IP privato)

**Azione:** Rimuovere o sanitizzare da tutta la storia git.

## Comandi di cleanup (scegliere uno)

### Opzione 1: Usare git filter-repo (consigliato)

Installa se non presente:
```bash
pip install git-filter-repo
```

**Importante:** `git filter-repo` richiede un clone fresco oppure l'uso di `--force`.

Se lavori sul repo locale, usa `--force`:
```bash
cd /home/luca/sae
git filter-repo --force --invert-paths --path utility/rpc-pool-complete.json
git filter-repo --force --invert-paths --path utility/rpc-pool-complete-copy.json
git filter-repo --force --invert-paths --path .continue/agents/new-config.yaml
git filter-repo --force --invert-paths --path debugSae.txt
git filter-repo --force --invert-paths --path debugSae2.txt
```

**Alternativa:** Clona il repo in una cartella temporanea:
```bash
git clone file:///home/luca/sae /tmp/sae-clean
cd /tmp/sae-clean
git filter-repo --invert-paths --path utility/rpc-pool-complete.json
git filter-repo --invert-paths --path utility/rpc-pool-complete-copy.json
# ... etc
cd /home/luca/sae
git fetch file:///tmp/sae-clean refs/heads/*:refs/heads/*
```

### Opzione 2: Usare git filter-branch (più lento, ma funziona sempre)

```bash
cd /home/luca/sae

# Rimuovi utility/rpc-pool-complete.json
git filter-branch --tree-filter 'rm -f utility/rpc-pool-complete.json utility/rpc-pool-complete-copy.json' -f -- --all

# Rimuovi config sensibili
git filter-branch --tree-filter 'rm -f .continue/agents/new-config.yaml' -f -- --all

# Rimuovi log sensibili
git filter-branch --tree-filter 'rm -f debugSae.txt debugSae2.txt' -f -- --all
```

### Opzione 3: Manuale (per sanitizzare senza rimuovere)

1. Edita i file per rimuovere chiavi/endpoint privati
2. Esegui:
```bash
git add .
git commit --amend --no-edit
git rebase -i HEAD~N  # dove N è il numero di commit da ripulire
```

## Post-cleanup

Dopo filter-repo/filter-branch:

```bash
# Pulisci i reference log
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Se usi origin, esegui force push (attenzione!)
git push origin --force-with-lease --all
git push origin --force-with-lease --tags
```

## Checklist pre-pubblicazione

- [ ] Rimuovere/sanitizzare file sensibili da historia
- [ ] Verificare .gitignore include tutti i file per runtime
- [ ] Rimuovere i file di cache/log dal working tree se non servono
- [ ] Testare che il repo compila dopo la pulizia
- [ ] Creare un .env.example template finale (ora minimale)
- [ ] Verificare che nessun secret sia esposto in README/docs
- [ ] Fare il push su GitHub

## File sicuri da tracciare

✓ src/backend/routes/auth.ts (infrastruttura, non chiavi)
✓ src/utils/auth/*.ts (librerie, non chiavi)
✓ src/app.ts
✓ .env.example (template senza valori reali)
✓ docs/patch-ambienti-env.md (documentazione)
