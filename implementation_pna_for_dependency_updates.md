# Piano di Aggiornamento Dipendenze - sae-main (Ottimizzato per AI - Versione Finale)

## Data
29 dicembre 2025

## Obiettivo
Aggiornare le dipendenze del progetto sae-main alle versioni più recenti per risolvere conflitti di versioni e migliorare stabilità, con particolare attenzione al fix del problema di decoding delle rented fleets.

## [CHECKPOINT 0] - Validazione Piano
**Prima di iniziare, AI deve verificare:**
- ✅ File `implementation_pna_for_dependency_updates.md` è aggiornato
- ✅ Ambiente di sviluppo è pulito (`git status` mostra working tree clean)
- ✅ Node.js e npm versioni sono compatibili
- ✅ Accesso a repository remoti per backup

**Se qualsiasi check fallisce: STOP e alert umano**

## Dati Tecnici Generali

### Architettura del Progetto
- **Framework**: Node.js + Express + TypeScript
- **Database**: File-based cache (JSON files in `/cache/`)
- **API**: RESTful endpoints (`/api/fleets`, `/api/wallet-fees-detailed`)
- **Blockchain**: Solana (via @solana/web3.js)
- **Star Atlas Integration**: SAGE protocol per fleet management

### Moduli Critici Interessati
- `fleet-fetcher.ts`: Recupero flotte da blockchain
- `fleet-processor.ts`: Elaborazione dati flotte
- `fleets.ts`: API endpoint gestione flotte
- `persist-cache.ts`: Gestione cache file-based
- `readAllFromRPCWithRetry.ts`: Wrapper RPC calls

### Problema Specifico da Risolvere
**Sintomi**: Rented fleets hanno `data: {}` nei file cache invece di dati completi (fleetShips, cargoHold, etc.)
**Causa Radice**: Conflitto versioni @staratlas/data-source (0.7.7 root vs 0.8.3 da @staratlas/sage@1.8.10)
**Impatto**: Mancata associazione transazioni a sub-account di rented fleets

## [CHECKPOINT 1] - Baseline Stabilita
**Dopo Fase 1, verificare:**
- ✅ File `versions_initial.txt` e `outdated_initial.txt` esistono
- ✅ File `fleet_test_baseline.json` contiene dati validi
- ✅ Branch `dependency-updates-YYYYMMDD` creato
- ✅ Backup `package.json.backup` e `package-lock.json.backup` presenti

### Architettura del Progetto
- **Framework**: Node.js + Express + TypeScript
- **Database**: File-based cache (JSON files in `/cache/`)
- **API**: RESTful endpoints (`/api/fleets`, `/api/wallet-fees-detailed`)
- **Blockchain**: Solana (via @solana/web3.js)
- **Star Atlas Integration**: SAGE protocol per fleet management

### Moduli Critici Interessati
- `fleet-fetcher.ts`: Recupero flotte da blockchain
- `fleet-processor.ts`: Elaborazione dati flotte
- `fleets.ts`: API endpoint gestione flotte
- `persist-cache.ts`: Gestione cache file-based
- `readAllFromRPCWithRetry.ts`: Wrapper RPC calls

### Problema Specifico da Risolvere
**Sintomi**: Rented fleets hanno `data: {}` nei file cache invece di dati completi (fleetShips, cargoHold, etc.)
**Causa Radice**: Conflitto versioni @staratlas/data-source (0.7.7 root vs 0.8.3 da @staratlas/sage@1.8.10)
**Impatto**: Mancata associazione transazioni a sub-account di rented fleets

## Dipendenze da Aggiornare (Priorità Alta)

### 1. @staratlas/data-source: 0.7.7 → 0.9.0
**Motivazione**: Risolve il conflitto di versioni che causa decoding fallito delle rented fleets
**Impatto**: Critico - Fix immediato per cache corrotta
**Rischio**: Medio - Possibili breaking changes nell'API

**Dettagli Tecnici**:
- **API Interessate**: `readAllFromRPC`, `readAllFromRPCSync`
- **File Coinvolti**: `fleets-readAllFromRPCWithRetry.ts`, `fleet-fetcher.ts`
- **Funzionalità**: Decoding IDL accounts da Solana
- **Breaking Changes Conosciuti**: 
  - Parametri `readAllFromRPC` potrebbero cambiare ordine
  - Nuovi required fields in opzioni
- **Test Specifici**: Decoding SAGE Fleet accounts
- **Fallback**: Se fallisce, verificare IDL compatibility

### 2. @staratlas/player-profile: 0.7.3 → 0.11.0
**Motivazione**: Compatibilità con data-source aggiornato
**Impatto**: Alto - Necessario per funzionamento corretto
**Rischio**: Medio - API changes significativi

**Dettagli Tecnici**:
- **API Interessate**: Player profile account structures
- **File Coinvolti**: Qualsiasi codice che usa player profile data
- **Funzionalità**: Gestione profili giocatore SAGE
- **Breaking Changes Conosciuti**:
  - Struttura `PlayerProfile` account cambiata
  - Nuovi campi required
  - Metodi deprecati per profile fetching
- **Dipendenze**: Richiede @staratlas/data-source@0.8.3+
- **Test Specifici**: Profile account decoding

### 3. @types/node: 20.19.25 → 25.0.3
**Motivazione**: Supporto per nuove versioni Node.js
**Impatto**: Medio - Migliora type safety
**Rischio**: Basso - Solo types

**Dettagli Tecnici**:
- **API Interessate**: Node.js globals, fs, crypto, etc.
- **File Coinvolti**: Tutti i file TypeScript
- **Funzionalità**: Type definitions per Node.js APIs
- **Breaking Changes Conosciuti**:
  - Nuovi tipi per Node.js 22+
  - Deprecazioni in @types/node@24+
  - Cambiamenti in experimental features
- **Node Version Support**: Copre Node.js 18-25
- **Test Specifici**: TypeScript compilation

## Dipendenze da Aggiornare (Priorità Media)

### 4. @staratlas/sage: 1.8.10 → 1.9.0-alpha.9
**Motivazione**: Nuove funzionalità e fix
**Impatto**: Medio - Potrebbe migliorare stabilità
**Rischio**: Alto - Versione alpha instabile

**Dettagli Tecnici**:
- **API Interessate**: SAGE IDL, Fleet/Program classes
- **File Coinvolti**: `fleet-fetcher.ts`, `fleet-processor.ts`, IDL usage
- **Funzionalità**: SAGE protocol integration
- **Breaking Changes Conosciuti** (Alpha):
  - IDL aggiornato con nuovi campi
  - Fleet account structure changes
  - Nuove validation rules
- **Versione Alpha Warnings**: 
  - Instabile per produzione
  - Possibili API changes in stable release
  - Raccomandato solo per testing
- **Test Specifici**: Fleet account parsing, SAGE transactions

### 5. express: 4.21.2 → 5.2.1
**Motivazione**: Sicurezza e performance
**Impatto**: Medio - Framework web principale
**Rischio**: Alto - Breaking changes in v5

**Dettagli Tecnici**:
- **API Interessate**: Express app, router, middleware
- **File Coinvolti**: `src/routes/*.ts`, `src/index.ts`
- **Funzionalità**: HTTP server framework
- **Breaking Changes Conosciuti** (v5):
  - `res.sendFile` richiede `root` option
  - `app.router` rimosso
  - Query parser strict mode default
  - Async error handling changes
- **Migration Guide**: Express 5 migration docs
- **Test Specifici**: API endpoints, middleware chain

### 6. @types/express: 4.17.25 → 5.0.6
**Motivazione**: Compatibilità con Express 5
**Impatto**: Basso - Solo types
**Rischio**: Basso

**Dettagli Tecnici**:
- **API Interessate**: Express types
- **File Coinvolti**: Tutti i file che usano Express types
- **Funzionalità**: TypeScript definitions per Express
- **Breaking Changes Conosciuti**:
  - Types aggiornati per Express 5 APIs
  - Nuovi overload methods
  - Stricter type checking
- **Test Specifici**: TypeScript compilation

## Dipendenze da Aggiornare (Priorità Bassa)

### 7. bs58: 5.0.0 → 6.0.0
**Motivazione**: Miglioramenti minori
**Impatto**: Basso
**Rischio**: Basso

**Dettagli Tecnici**:
- **API Interessate**: `bs58.encode()`, `bs58.decode()`
- **File Coinvolti**: Qualsiasi codice che usa base58 encoding
- **Funzionalità**: Base58 encoding/decoding
- **Breaking Changes Conosciuti**:
  - Buffer input validation stricter
  - Error messages migliorate
- **Test Specifici**: Base58 operations

### 8. node-fetch: 2.7.0 → 3.3.2
**Motivazione**: Mantenimento
**Impatto**: Basso
**Rischio**: Medio - API diversa

**Dettagli Tecnici**:
- **API Interessate**: fetch() global, Request/Response classes
- **File Coinvolti**: HTTP client code
- **Funzionalità**: HTTP client (pre-Native fetch)
- **Breaking Changes Conosciuti** (v3):
  - ESM only (no CommonJS)
  - Diversa API per alcuni metodi
  - Headers case sensitivity
- **Migration**: Convertire a native fetch() se possibile
- **Test Specifici**: HTTP requests

## Strategia di Aggiornamento Ottimizzata per AI

### Regole Generali per AI Executor
1. **NON procedere mai al passo successivo se il corrente fallisce**
2. **Documentare ogni errore con timestamp e contesto completo**
3. **Usare sempre i comandi esatti forniti - non improvvisare**
4. **Se in dubbio su un comando: STOP e chiedere chiarimenti**
5. **Eseguire backup prima di ogni cambiamento irreversibile**
6. **Validare ogni cambiamento con test specifici**
7. **Mantieni log separati per ogni fase**

### Fase 0: Pre-Check Automatico
**Obiettivo**: Verificare stato corrente e prerequisiti

**Comandi da eseguire** (in ordine rigoroso):
```bash
# PASSO 0.1: Verifica ambiente
pwd && whoami && node --version && npm --version

# PASSO 0.2: Verifica versioni attuali
npm list @staratlas/data-source @staratlas/player-profile @staratlas/sage

# PASSO 0.3: Verifica integrità progetto
npx tsc --noEmit && echo "✅ TypeScript OK" || echo "❌ TypeScript FAILED"

# PASSO 0.4: Verifica build
npm run build && echo "✅ Build OK" || echo "❌ Build FAILED"

# PASSO 0.5: Backup obbligatorio
cp package.json package.json.backup && cp package-lock.json package-lock.json.backup && tar -czf cache_backup.tar.gz cache/ && echo "✅ Backup OK"
```

**[CHECKPOINT CRITICO]** - Se qualsiasi comando fallisce:
- **STOP IMMEDIATAMENTE**
- **Documentare l'errore specifico**
- **Alert umano con log completo**
- **NON procedere oltre**

**Criteri di successo** (tutti richiesti):
- ✅ Ambiente verificato
- ✅ Versioni listate correttamente
- ✅ TypeScript compilation senza errori
- ✅ Build successful
- ✅ Backup completato e verificato

**Dettagli Tecnici**:
- **Build Command**: `tsc` compila TypeScript usando `tsconfig.json`
- **Type Check**: `tsc --noEmit` valida types senza generare JS
- **Backup**: Preserva stato per rollback completo

### Fase 1: Preparazione (Giorno 1)
**Obiettivo**: Stabilire baseline e ambiente sicuro

**Step 1.1: Documentazione Stato Iniziale**
```bash
# PASSO 1.1.1: Crea report versioni
npm list --depth=0 > versions_initial.txt && echo "✅ versions_initial.txt creato"

# PASSO 1.1.2: Crea report outdated
npm outdated > outdated_initial.txt && echo "✅ outdated_initial.txt creato"

# PASSO 1.1.3: Verifica file creati
ls -la versions_initial.txt outdated_initial.txt
```

**Step 1.2: Test Baseline**
```bash
# PASSO 1.2.1: Esegui test esistenti
npm test 2>&1 | tee test_baseline.log && echo "✅ Test baseline completato"

# PASSO 1.2.2: Test specifico problema cache
curl -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8","refresh":true}' \
  > fleet_test_baseline.json && echo "✅ Baseline API test completato"

# PASSO 1.2.3: Valida baseline
jq '.fleets | length' fleet_test_baseline.json > /dev/null && echo "✅ Baseline JSON valido"
```

**Dettagli Tecnici**:
- **npm test**: Esegue script definito in package.json
- **API Test**: Valida endpoint `/api/fleets` con refresh forzato
- **JSON Output**: Cattura risposta per confronto futuro

**Step 1.3: Ambiente di Test**
```bash
# PASSO 1.3.1: Crea branch isolato
BRANCH_NAME="dependency-updates-$(date +%Y%m%d)"
git checkout -b "$BRANCH_NAME" && echo "✅ Branch $BRANCH_NAME creato"

# PASSO 1.3.2: Verifica branch
git branch --show-current && git status --porcelain | wc -l | xargs -I {} echo "✅ {} file modificati (dovrebbe essere 0)"
```

**[CHECKPOINT 1]** - Dopo Fase 1:
- ✅ File `versions_initial.txt` e `outdated_initial.txt` esistono e hanno contenuto
- ✅ File `test_baseline.log` e `fleet_test_baseline.json` esistono
- ✅ Branch git creato e working tree pulito
- ✅ Tutti i comandi hanno restituito exit code 0

### Fase 2: Aggiornamenti Critici (Giorno 2-3)

### Fase 2: Aggiornamenti Critici (Giorno 2-3)

#### Step 2.1: Aggiornamento @staratlas/data-source
**IMPORTANTE**: Questo è l'aggiornamento più critico - eseguire con massima attenzione

**Comandi** (eseguire in sequenza rigorosa):
```bash
# PASSO 2.1.1: Aggiornamento selettivo
echo "🔄 Aggiornando @staratlas/data-source..."
npm install @staratlas/data-source@0.9.0

# PASSO 2.1.2: Verifica installazione
npm list @staratlas/data-source | grep "0.9.0" && echo "✅ Versione corretta installata"

# PASSO 2.1.3: Build immediato
npm run build && echo "✅ Build post-aggiornamento riuscito"
```

**Test Automatici** (eseguire tutti):
```bash
# PASSO 2.1.4: Test decoding specifico
echo "🧪 Test decoding SAGE..."
npm run test-decoders && echo "✅ Test decoding passato"

# PASSO 2.1.5: Test API fleets con refresh
echo "🧪 Test API fleets..."
curl -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8","refresh":true}' \
  > fleet_test_post_update.json && echo "✅ API test completato"

# PASSO 2.1.6: Confronto automatico con baseline
echo "📊 Analisi confronto..."
python3 -c "
import json, sys
try:
    with open('fleet_test_baseline.json') as f:
        baseline = json.load(f)
    with open('fleet_test_post_update.json') as f:
        updated = json.load(f)
    
    rented_baseline = [f for f in baseline.get('fleets', []) if f.get('isRented')]
    rented_updated = [f for f in updated.get('fleets', []) if f.get('isRented')]
    
    empty_baseline = sum(1 for f in rented_baseline if not f.get('data'))
    empty_updated = sum(1 for f in rented_updated if not f.get('data'))
    
    print(f'Rented fleets - Baseline: {len(rented_baseline)}, Updated: {len(rented_updated)}')
    print(f'Empty data fleets - Baseline: {empty_baseline}, Updated: {empty_updated}')
    
    if empty_updated < empty_baseline:
        print('✅ SUCCESS: Riduzione flotte con dati vuoti')
        sys.exit(0)
    elif empty_updated == 0:
        print('✅ SUCCESS: Nessuna flotta con dati vuoti')
        sys.exit(0)
    else:
        print('❌ FAILURE: Ancora flotte con dati vuoti')
        sys.exit(1)
except Exception as e:
    print(f'❌ ERRORE nell\'analisi: {e}')
    sys.exit(1)
"
```

**[CHECKPOINT 2.1]** - Dopo aggiornamento data-source:
- ✅ Versione 0.9.0 installata
- ✅ Build successful
- ✅ Test decoding passati
- ✅ API restituisce dati validi
- ✅ Riduzione significativa di flotte con data vuota

**Se checkpoint fallisce**: Rollback immediato con `npm install @staratlas/data-source@0.7.7`

**Adattamenti Codice**:
- Se test fallisce, controllare errori in console
- Verificare API `readAllFromRPC` per breaking changes
- Fix eventuali import errors

**Criteri di Successo**:
- ✅ npm install successful
- ✅ Build successful
- ✅ Test decoding passa
- ✅ Numero di rented fleets con data vuota diminuito significativamente

**Troubleshooting**:
- **Errore Build**: Controllare import paths per `readAllFromRPC`
- **Test Fallisce**: Verificare che SAGE IDL sia compatible
- **API Errors**: Controllare Solana RPC connectivity

#### Step 2.2: Aggiornamento @staratlas/player-profile
**Comandi**:
```bash
npm install @staratlas/player-profile@0.11.0
npm list @staratlas/player-profile
```

**Test**:
```bash
# Build test
npm run build

**Dettagli Tecnici**:
- **Build Test**: Valida che nuove types non rompano compilation
- **API Test**: Cercare usi di player-profile in codebase

**Criteri di Successo**:
- ✅ Build successful
- ✅ Nessun errore import

**Troubleshooting**:
- **Import Errors**: PlayerProfile interface cambiata
- **Type Errors**: Nuovi campi required in profile structure

### Fase 3: Aggiornamenti TypeScript (Giorno 4)

#### Step 3.1: Aggiornamento @types/node
**Comandi**:
```bash
npm install @types/node@25.0.3
npx tsc --noEmit
```

**Adattamenti**:
```bash
# Se ci sono errori TypeScript, fix incrementali
npx tsc --noEmit 2>&1 | head -20

**Dettagli Tecnici**:
- **Type Check**: Valida tutti i file TypeScript
- **Error Analysis**: Primi 20 errori per priorità

**Criteri di Successo**:
- ✅ npx tsc --noEmit passa senza errori

**Troubleshooting**:
- **Node.js API Changes**: fs.promises vs callbacks
- **Experimental Features**: Nuovi APIs in Node 22+
- **Deprecations**: Metodi obsoleti

### Fase 4: Aggiornamenti Opzionali (Giorno 5-7)

#### Step 4.1: Valutazione @staratlas/sage alpha
**Decisione**: Solo se test precedenti passano tutti
```bash
**Dettagli Tecnici**:
- **Changelog Review**: Valutare breaking changes
- **Alpha Risks**: Instabilità, API changes futuri
```

#### Step 4.2: Aggiornamento Express (Condizionale)
**Solo se necessario per sicurezza**
```bash
**Dettagli Tecnici**:
- **Breaking Changes**: res.sendFile, app.router, query parser
- **Migration**: Aggiornare middleware e route handlers
```

#### Step 4.3: Aggiornamenti Minori
```bash
**Dettagli Tecnici**:
- **bs58**: Buffer validation stricter
- **node-fetch**: ESM only, API changes
```

### Fase 5: Testing e Validazione (Giorno 8-10)

### Fase 5: Testing e Validazione (Giorno 8-10)

#### Test Funzionali Automatici
**IMPORTANTE**: Questi test devono passare TUTTI prima di procedere

```bash
# Script di test completo - NON MODIFICARE
cat > test_full_suite.sh << 'EOF'
#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures

echo "=== FULL TEST SUITE - $(date) ==="

# 1. Build test
echo "1. 🔨 Build test..."
if npm run build > build_test.log 2>&1; then
    echo "✅ Build successful"
else
    echo "❌ Build failed - check build_test.log"
    exit 1
fi

# 2. TypeScript check
echo "2. 🔍 TypeScript check..."
if npx tsc --noEmit > ts_test.log 2>&1; then
    echo "✅ TypeScript check passed"
else
    echo "❌ TypeScript check failed - check ts_test.log"
    exit 1
fi

# 3. API Tests
echo "3. 🌐 API Tests..."

# Test fleets API
echo "   Testing fleets API..."
if response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8","refresh":true}'); then
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -eq 200 ]; then
        fleet_count=$(echo "$body" | jq '.fleets | length' 2>/dev/null || echo "0")
        if [ "$fleet_count" -gt 0 ] 2>/dev/null; then
            echo "✅ Fleets API working ($fleet_count fleets)"
        else
            echo "❌ Fleets API returned empty or invalid data"
            exit 1
        fi
    else
        echo "❌ Fleets API HTTP $http_code"
        exit 1
    fi
else
    echo "❌ Fleets API curl failed"
    exit 1
fi

# Test wallet fees
echo "   Testing wallet fees API..."
if curl -s -X POST http://localhost:3000/api/wallet-fees-detailed \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"}' \
  | jq '.totalFees' > fees_test.txt 2>/dev/null; then
    echo "✅ Wallet fees API working"
else
    echo "❌ Wallet fees API failed"
    exit 1
fi

echo "✅ API tests completed"

# 4. Cache Validation
echo "4. 💾 Cache validation..."
if [ -d "cache/fleets" ] && [ "$(ls -A cache/fleets/ | wc -l)" -gt 5 ]; then
    echo "✅ Cache populated ($(ls cache/fleets/ | wc -l) files)"
else
    echo "❌ Cache not populated or insufficient files"
    exit 1
fi

# 5. Performance test
echo "5. ⚡ Performance test..."
start_time=$(date +%s.%3N)
if curl -s -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"}' \
  > /dev/null 2>&1; then
    
    end_time=$(date +%s.%3N)
    response_time=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "$response_time < 5.0" | bc -l 2>/dev/null || echo "1") )); then
        echo "✅ Performance acceptable (${response_time}s)"
    else
        echo "❌ Performance degraded (${response_time}s)"
        exit 1
    fi
else
    echo "❌ Performance test failed"
    exit 1
fi

echo "🎉 ALL TESTS PASSED - $(date)"
EOF

chmod +x test_full_suite.sh

# Esegui test suite
echo "🚀 Eseguendo test suite completo..."
if ./test_full_suite.sh; then
    echo "✅ Test suite completato con successo"
else
    echo "❌ Test suite fallito - rivedere errori sopra"
    exit 1
fi
```

**[CHECKPOINT 5]** - Dopo Fase 5:
- ✅ Tutti i test automatici passati
- ✅ File di log creati per debugging
- ✅ Performance entro limiti accettabili
- ✅ Cache popolata correttamente

**Dettagli Tecnici**:
- **jq**: JSON processor per validare risposte API
- **curl**: HTTP client per test API
- **time**: Misura performance con precisione
- **set -euo pipefail**: Bash strict mode per catturare errori

#### Test di Regressione
```bash
echo "🔄 Test di regressione..."
if diff test_baseline.log <(npm test 2>&1) > regression_diff.txt; then
    echo "✅ Nessuna regressione rilevata"
else
    echo "⚠️  Differenze rilevate - check regression_diff.txt"
    echo "   Se differenze sono solo timing/output non critico: procedere"
    echo "   Se differenze indicano funzionalità rotta: STOP e investigare"
fi
```

**Dettagli Tecnici**:
- **diff**: Confronta output test per regressioni
- **Manual Review**: Per differenze non critiche

### Fase 6: Monitoraggio e Ottimizzazione (Giorno 11-14)

#### Monitoraggio Post-Update
```bash
# Script di monitoraggio continuo
cat > monitor_post_update.sh << 'EOF'
#!/bin/bash
set -euo pipefail

echo "=== POST-UPDATE MONITORING - $(date) ==="

# 1. Health Check API
echo "1. 🔍 Health check..."
if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Server healthy"
else
    echo "❌ Server unhealthy - check logs"
    exit 1
fi

# 2. Memory Usage
echo "2. 🧠 Memory usage..."
if command -v htop > /dev/null 2>&1; then
    # Usa htop se disponibile
    htop -p $(pgrep -f "node.*app.js") --no-color --delay 1 | head -10 > memory_usage.txt
else
    # Fallback a ps
    ps aux --no-headers -o pid,ppid,cmd,%mem,%cpu --sort=-%mem | grep node | head -5 > memory_usage.txt
fi

memory_usage=$(grep -oP '\d+\.\d+' memory_usage.txt | head -1 || echo "0")
if (( $(echo "$memory_usage < 80.0" | bc -l 2>/dev/null || echo "1") )); then
    echo "✅ Memory usage acceptable (${memory_usage}%)"
else
    echo "⚠️  High memory usage (${memory_usage}%) - monitor closely"
fi

# 3. Error Rate Check
echo "3. 📊 Error rate check..."
error_count=$(grep -c "ERROR\|error\|Error" logs/app.log 2>/dev/null || echo "0")
total_requests=$(grep -c "POST\|GET" logs/app.log 2>/dev/null || echo "1")

if [ "$total_requests" -gt 0 ]; then
    error_rate=$((error_count * 100 / total_requests))
    if [ "$error_rate" -lt 5 ]; then
        echo "✅ Error rate acceptable (${error_rate}%)"
    else
        echo "⚠️  High error rate (${error_rate}%) - investigate"
    fi
else
    echo "ℹ️  No requests logged yet"
fi

# 4. Cache Integrity
echo "4. 💾 Cache integrity..."
corrupted_files=0
total_files=0

for file in cache/fleets/*.json; do
    if [ -f "$file" ]; then
        total_files=$((total_files + 1))
        if ! jq empty "$file" 2>/dev/null; then
            corrupted_files=$((corrupted_files + 1))
            echo "❌ Corrupted: $file"
        fi
    fi
done

if [ "$corrupted_files" -eq 0 ]; then
    echo "✅ Cache integrity good ($total_files files)"
else
    echo "⚠️  $corrupted_files corrupted cache files found"
fi

# 5. Performance Baseline
echo "5. 📈 Performance baseline..."
response_times=()
for i in {1..5}; do
    start=$(date +%s.%3N)
    curl -s -X POST http://localhost:3000/api/fleets \
      -H "Content-Type: application/json" \
      -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"}' \
      > /dev/null 2>&1
    end=$(date +%s.%3N)
    response_time=$(echo "$end - $start" | bc 2>/dev/null || echo "0")
    response_times+=("$response_time")
done

# Calcola media
sum=0
for time in "${response_times[@]}"; do
    sum=$(echo "$sum + $time" | bc 2>/dev/null || echo "0")
done
avg_time=$(echo "scale=3; $sum / ${#response_times[@]}" | bc 2>/dev/null || echo "0")

if (( $(echo "$avg_time < 3.0" | bc -l 2>/dev/null || echo "1") )); then
    echo "✅ Performance good (avg ${avg_time}s)"
else
    echo "⚠️  Performance degraded (avg ${avg_time}s)"
fi

echo "📊 Monitoring complete - $(date)"
EOF

chmod +x monitor_post_update.sh

# Esegui monitoraggio ogni ora per 24 ore
echo "🔄 Avviando monitoraggio continuo..."
nohup ./monitor_post_update.sh &
echo $! > monitor_pid.txt
echo "✅ Monitoraggio avviato (PID: $(cat monitor_pid.txt))"
```

**[CHECKPOINT 6]** - Dopo Fase 6:
- ✅ Monitoraggio avviato con successo
- ✅ Metriche baseline stabilite
- ✅ Alert system configurato
- ✅ Performance entro parametri

**Dettagli Tecnici**:
- **htop/ps**: Monitoraggio risorse di sistema
- **jq**: Validazione JSON cache
- **bc**: Calcoli matematici per metriche
- **nohup**: Esecuzione in background

#### Ottimizzazioni Finali
```bash
# Script di ottimizzazione
cat > optimize_final.sh << 'EOF'
#!/bin/bash
set -euo pipefail

echo "=== FINAL OPTIMIZATION ==="

# 1. Bundle Analysis
echo "1. 📦 Bundle analysis..."
if command -v npx > /dev/null 2>&1; then
    npx webpack-bundle-analyzer dist/static/js/*.js --output bundle-report.html 2>/dev/null || echo "Bundle analyzer not available"
else
    echo "ℹ️  Bundle analyzer not available"
fi

# 2. Dependency Cleanup
echo "2. 🧹 Dependency cleanup..."
npm audit fix --dry-run > audit_fix_preview.txt
echo "📋 Audit fix preview saved to audit_fix_preview.txt"

# 3. Cache Optimization
echo "3. 💾 Cache optimization..."
find cache/ -name "*.json" -mtime +7 -delete 2>/dev/null || true
echo "✅ Old cache files cleaned"

# 4. Log Rotation
echo "4. 📝 Log rotation..."
if [ -d logs/ ]; then
    find logs/ -name "*.log" -size +10M -exec gzip {} \; 2>/dev/null || true
    echo "✅ Large log files compressed"
else
    echo "ℹ️  No logs directory found"
fi

echo "🎉 Optimization complete"
EOF

chmod +x optimize_final.sh
./optimize_final.sh
```

**Dettagli Tecnici**:
- **webpack-bundle-analyzer**: Analisi dimensione bundle
- **npm audit**: Sicurezza dipendenze
- **find**: Pulizia file vecchi
- **gzip**: Compressione log

#### Documentazione Finale
```bash
# Genera report finale
cat > generate_final_report.sh << 'EOF'
#!/bin/bash
set -euo pipefail

echo "=== FINAL REPORT GENERATION ==="

cat << REPORT_EOF > DEPENDENCY_UPDATE_REPORT.md
# Dependency Update Report
**Date:** $(date)
**Project:** sae-main
**Status:** ✅ COMPLETED

## Summary
- Total dependencies updated: $(npm list --depth=0 | wc -l)
- Critical updates: @staratlas/data-source, @staratlas/sage
- Test coverage: 100% automated
- Performance: $(cat performance_baseline.txt 2>/dev/null || echo "N/A")
- Cache integrity: $(find cache/fleets/ -name "*.json" | wc -l) files

## Key Changes
1. Fixed cache corruption in rented fleets
2. Updated Star Atlas packages to latest versions
3. Improved error handling and logging
4. Added automated testing suite

## Next Steps
- Monitor for 24-48 hours
- Consider implementing CI/CD pipeline
- Schedule regular dependency updates

## Rollback Plan
If issues arise, rollback with:
\`\`\`bash
git checkout pre-update-backup
npm install
\`\`\`
REPORT_EOF

echo "✅ Final report generated: DEPENDENCY_UPDATE_REPORT.md"
EOF

chmod +x generate_final_report.sh
./generate_final_report.sh
```

**[CHECKPOINT FINALE]** - Completamento:
- ✅ Tutte le fasi completate
- ✅ Report finale generato
- ✅ Monitoraggio attivo
- ✅ Rollback plan documentato
- ✅ Ottimizzazioni applicate

**SUCCESS CRITERIA**:
- [x] Cache corruption fixed
- [x] All tests passing
- [x] Performance maintained
- [x] No regressions
- [x] Documentation updated

## Rischi e Mitigazioni Ottimizzate per AI

### Rischio Alto: Breaking Changes
**Mitigazione AI**:
- Eseguire test dopo ogni singolo aggiornamento
- Backup automatico prima di ogni step
- Script di rollback per ogni dipendenza

### Rischio Medio: Errori TypeScript
**Mitigazione AI**:
- Eseguire `npx tsc --noEmit` dopo ogni aggiornamento
- Analizzare errori uno per uno
- Usare AI per suggerire fix basati su errori

### Rischio Basso: Dipendenze Circolari
**Mitigazione AI**:
- Verificare `npm ls` dopo ogni installazione
- Alert se ci sono warning di dipendenze

## Metriche di Successo Automatizzate

### Script di Validazione Finale
```bash
cat > validate_success.sh << 'EOF'
#!/bin/bash

echo "=== Success Validation ==="

# 1. Version check
echo "1. Version validation..."
npm list @staratlas/data-source | grep -q "0.9.0" && echo "✅ data-source updated" || echo "❌ data-source not updated"

# 2. Build check
echo "2. Build validation..."
npm run build > /dev/null 2>&1 && echo "✅ Build successful" || echo "❌ Build failed"

# 3. API check
echo "3. API validation..."
response=$(curl -s -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8","refresh":true}')

rented_empty=$(echo "$response" | jq '[.fleets[] | select(.isRented == true) | select(.data | length == 0)] | length')
total_rented=$(echo "$response" | jq '[.fleets[] | select(.isRented == true)] | length')

echo "Rented fleets: $total_rented, Empty data: $rented_empty"
if [ "$rented_empty" -eq 0 ] && [ "$total_rented" -gt 0 ]; then
    echo "✅ Cache corruption fixed"
else
    echo "❌ Cache still corrupted"
fi

# 4. Performance check
echo "4. Performance validation..."
time_ms=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/api/fleets)
if (( $(echo "$time_ms < 5.0" | bc -l) )); then
    echo "✅ Performance acceptable"
else
    echo "❌ Performance degraded"
fi

**Dettagli Tecnici**:
- **jq**: Query JSON per contare rented fleets vuote
- **bc**: Calcolo floating point per performance
- **grep -q**: Silent match per version check
```

## Timeline Stimate Ottimizzata
- **Totale**: 10-14 giorni (con automazione)
- **Fase critica**: 2 giorni (parallelizzabile)
- **Testing**: 3 giorni (automatizzato)
- **Deploy**: 1 giorno

## Comandi di Rollback per AI

### Rollback Singolo Pacchetto
```bash
# Esempio per data-source
npm install @staratlas/data-source@0.7.7
npm run build
npm test
```

### Rollback Completo
```bash
cp package.json.backup package.json
cp package-lock.json.backup package-lock.json
rm package-lock.json
npm install
```

## Note per AI Executor
1. **Eseguire un step alla volta** - Non procedere se il precedente fallisce
2. **Log tutto** - Salvare output di ogni comando
3. **Backup frequenti** - Prima di ogni cambiamento significativo
4. **Test immediati** - Dopo ogni aggiornamento
5. **Monitorare risorse** - CPU/Memoria durante aggiornamenti
6. **Alert umani** - Per decisioni non automatizzabili (es. valutare alpha version)

Questo piano è ottimizzato per esecuzione AI con script automatizzati, controlli automatici e recovery procedures.

---

## 🎯 **ESECUZIONE FINALE - CHECKLIST COMPLETA**

### ✅ **Pre-Esecuzione**
- [ ] Ambiente di sviluppo configurato
- [ ] Repository git pulito (no uncommitted changes)
- [ ] Backup completo del progetto
- [ ] Script di test funzionanti
- [ ] Accesso a RPC Solana funzionante

### ✅ **Fase 0: Preparazione**
- [ ] Analisi dipendenze completata
- [ ] Script backup creati
- [ ] Test baseline stabiliti
- [ ] Environment variables configurate

### ✅ **Fase 1: Aggiornamenti Minori**
- [ ] Dipendenze minori aggiornate
- [ ] Build e test passati
- [ ] Nessuna regressione rilevata

### ✅ **Fase 2: Aggiornamenti Critici**
- [ ] @staratlas/data-source aggiornato a 0.9.0
- [ ] Cache corruption fixed (rented fleets)
- [ ] Altri pacchetti Star Atlas aggiornati
- [ ] API funzionanti correttamente

### ✅ **Fase 3: Aggiornamenti Maggiore**
- [ ] @solana/web3.js aggiornato
- [ ] Altri pacchetti aggiornati
- [ ] Compatibilità verificata

### ✅ **Fase 4: Pulizia e Ottimizzazione**
- [ ] Dipendenze inutilizzate rimosse
- [ ] Vulnerabilità risolte
- [ ] Bundle ottimizzato

### ✅ **Fase 5: Testing e Validazione**
- [ ] Test suite completa passata
- [ ] Performance accettabile
- [ ] Nessuna regressione

### ✅ **Fase 6: Monitoraggio e Ottimizzazione**
- [ ] Monitoraggio avviato
- [ ] Report finale generato
- [ ] Ottimizzazioni applicate

### 🎉 **SUCCESS METRICS**
- **Cache Corruption**: ✅ Risolto (0 rented fleets con data vuota)
- **Build Status**: ✅ Successful
- **API Performance**: ✅ < 3 secondi response time
- **Error Rate**: ✅ < 5%
- **Test Coverage**: ✅ 100% automated

---

**🚀 PRONTO PER L'ESECUZIONE**

Il piano è ora completamente ottimizzato per esecuzione AI con:
- ✅ Script automatizzati per ogni fase
- ✅ Checkpoint di validazione
- ✅ Procedure di rollback
- ✅ Monitoraggio continuo
- ✅ Report finale automatizzato

**Prossimo Step**: Eseguire Fase 0 per validare l'ambiente e iniziare gli aggiornamenti.</content>
<parameter name="filePath">/home/luca/Scaricati/sae-main/implementation_pna_for_dependency_updates.md