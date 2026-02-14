# SAE - Star Atlas Explorer

**SAE** è un'applicazione web per l'analisi delle operazioni SAGE (Star Atlas Game Engine) su blockchain Solana. Il progetto permette di tracciare, decodificare e visualizzare tutte le attività di un giocatore Star Atlas nelle ultime 24 ore, con focus su flotte, mining, crafting e gestione risorse.

***

## 🎯 Cosa Fa

SAE analizza le transazioni blockchain di un profilo giocatore Star Atlas e fornisce:

* **Tracking completo operazioni**: Decodifica tutte le transazioni SAGE (mining, movimento flotte, crafting, consumo risorse)
* **Analisi fleet**: Visualizza lo stato delle flotte possedute e in affitto
* **Breakdown dettagliato**: Associa operazioni a specifiche flotte, cargo, munizioni e carburante
* **Aggregazione statistiche**: Fee totali, punti guadagnati, risorse consumate
* **Interfaccia web moderna**: Grafici interattivi, ticker prezzi real-time, export dati

***

## 🏗️ Architettura

Il progetto è composto da:

### Backend (Node.js + TypeScript)

* **API REST** per analisi profili (`/api/analyze-profile`)
* **Decoder Rust** per parsing ottimizzato dei dati blockchain
* **RPC Pool Manager** per gestione efficiente delle connessioni Solana RPC
* **Sistema di cache** locale per velocizzare analisi ripetute

### Frontend (Vanilla JS + Chart.js)

* Interfaccia single-page con visualizzazione dati in tempo reale
* Grafici operazioni, breakdown flotte, ticker prezzi
* Export JSON dei risultati

### Decoder (Rust)

* Decoder standalone per profili e flotte Star Atlas
* Basato su `carbon-player-profile-decoder`

***

## 🚀 Quick Start

### Prerequisiti

* Node.js 18+
* Rust (per build decoder)
* npm

### Installazione

```bash
# Installa dipendenze backend e frontend
npm install

# Build completo (backend + frontend + decoder)
npm run build
```

### Avvio Server

```bash
# Metodo consigliato (con logging completo)
pkill -9 node
cd <project_root>
rm -rf log cache dist
sleep 1
npm run build && mkdir -p log && nohup npm run dev > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &
```

Oppure avvio rapido senza rebuild:

```bash
npm run dev
```

Il server sarà disponibile su `http://localhost:3000`

***

## 📡 API Disponibili

### Analisi Profili

#### POST `/api/analyze-profile`

Avvia l'analisi completa delle operazioni SAGE per un profilo giocatore.

**Body JSON:**

```json
{
  "profileId": "4PsiXxqZZkRynC96U.....",
  "wipeCache": false,
  "lats": 24
}
```

**Parametri:**
* `profileId` (string, richiesto): ID del profilo Star Atlas da analizzare
* `wipeCache` (boolean, opzionale): cancella cache prima dell'analisi (default: false)
* `lats` (number, opzionale): ore di lookback per transazioni (default: 24)
* `cachePersist` (boolean, opzionale): se true, mantiene la cache completa (skips cleanup, solo debug) (default: false)

**Esempi cURL:**

Analisi standard con cleanup automatico:
```bash
curl -X POST http://localhost:3000/api/analyze-profile \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
    "wipeCache": false,
    "lats": 24
  }'
```

Con cache persistente (debug mode, mantiene tutti i file cache):
```bash
curl -X POST http://localhost:3000/api/analyze-profile \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
    "cachePersist": true
  }'
```

**Risposta:**
```json
{
  "fleets": [...],
  "rentedFleets": [...],
  "walletAuthority": "...",
  "feePayer": "...",
  "walletTxs": [...],
  "aggregation": {...},
  "fleetBreakdown": {...},
  "playerOps": [...]
}
```

---

### Prezzi e Dati di Mercato

#### GET `/api/prices`

Ritorna i prezzi attuali di token principali (Bitcoin, Solana, Star Atlas, Atlas DAO, WPAC).

**Query Parameters:** nessuno

**Risposta:**
```json
{
  "bitcoin": { "usd": 45000, ... },
  "solana": { "usd": 150, ... },
  "star-atlas": { "usd": 0.02, ... },
  "star-atlas-dao": { "usd": 0.50, ... },
  "wpac": 0.005
}
```

---

### Debug & Utility APIs

Tutte le seguenti API sono disponibili sotto `/api/debug/`:

#### GET `/debug/player-profile-id?wallet=<wallet_pubkey>`

**Ricerca on-chain** del profilo giocatore data una wallet pubkey (owner o authority).

**Query Parameters:**
* `wallet` (string, richiesto): wallet pubkey del proprietario/autorità

**Risposta:**
```json
{
  "wallet": "GeUiZvjERgN95MFxU5....",
  "message": "Player Profile account(s) found on-chain for wallet",
  "variants": [
    {
      "label": "profile_found_1",
      "profileId": "4PsiXxqZZkRynC96UMZ....",
      "description": "Profile account found containing wallet...",
      "source": "on-chain search at offset 30"
    }
  ]
}
```

#### GET `/debug/decode-profile-with-rust?profileId=<id>`

Decodifica un profilo usando il decoder Rust ottimizzato.

**Query Parameters:**
* `profileId` (string, richiesto): ID del profilo da decodificare

**Risposta:** Dati decodificati del profilo (version, auth_key_count, key_threshold, profile_keys, ecc.)

#### GET `/debug/dump-profile-hex?profileId=<id>`

Ritorna il contenuto grezzo esadecimale dell'account profilo.

#### GET `/debug/get-wallet-authority?profileId=<id>`

Estrae tutte le chiavi autorizzate (allowed wallets) da un profilo.

**Risposta:**
```json
{
  "allowedWallets": [
    {
      "pubkey": "...",
      "permissions": "..."
    }
  ]
}
```

#### GET `/debug/scan-profile-owner?profileId=<id>`

Scansiona e identifica il proprietario del profilo.

#### GET `/debug/get-wallet-txs?profileId=<id>&cutoffH=<hours>`

Recupera e decodifica tutte le transazioni di una wallet nel periodo specificato.

**Query Parameters:**
* `profileId` (string, richiesto): ID del profilo
* `cutoffH` (number, opzionale): ore di lookback (default: 24)

#### GET `/debug/get-fleets?profileId=<id>`

Recupera e decodifica tutte le flotte possedute da un profilo.

#### GET `/debug/get-rented-fleets?profileId=<id>`

Recupera tutte le flotte in affitto (contratti di rental) per un profilo.

#### GET `/debug/decode-sage-ops?profileId=<id>`

Decodifica tutte le operazioni SAGE per un profilo.

#### GET `/debug/decode-sage-ops-full?profileId=<id>`

Decodifica completa delle operazioni SAGE con enrichment dati e associazione flotte.

#### GET `/debug/associate-sage-ops-to-fleets?profileId=<id>`

Associa le operazioni SAGE decodificate alle flotte specifiche.

#### GET `/debug/dump-fleets?profileId=<id>`

Dump grezzo di tutte le flotte associate al profilo.

#### GET `/debug/refresh-allowed-wallets?profileId=<id>`

Rinfresca la cache delle chiavi autorizzate per un profilo.

#### POST `/debug/playload`

Analizza le fee e break-down dettagliato delle operazioni pagatori.

**Body JSON:**
```json
{
  "profileId": "...",
  "cutoffH": 24
}
```

#### GET `/debug/enrich-fleet-state-handler-test`

Endpoint di test per enrichment dello stato fleet (mining, idle, movimento, ecc.)

---

### Frontend

#### GET `/`

Serve la Single Page Application (SPA) web per l'analisi interattiva dei profili.

***

## 🔧 Comandi Utili

```bash
# Build solo backend
npm run build:backend

# Build solo frontend
npm run build:frontend

# Watch mode per sviluppo backend
npm run build:watch

# Avvio server di sviluppo
npm run dev

# Test RPC Pool Manager
npm run test
```

***

## 📁 Struttura Progetto

```
sae/
├── src/                  # Backend TypeScript
│   ├── app.ts           # Entry point server Express
│   ├── analysis/        # Logica analisi profili e flotte
│   ├── utils/           # Utility (RPC pool, cache, decoder)
│   └── backend/         # Route API
├── frontend/            # Frontend statico
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── decoder/             # Decoder Rust standalone
├── cache/               # Cache locale profili analizzati
└── utility/             # File di configurazione RPC pool
```

***

## 🛠️ Tecnologie Utilizzate

* **Backend**: Node.js, TypeScript, Express
* **Frontend**: Vanilla JavaScript, Chart.js
* **Blockchain**: Solana Web3.js, Anchor
* **Decoder**: Rust, Borsh, carbon-player-profile-decoder
* **Build**: TypeScript Compiler, tsx

***

## 📝 Note Sviluppo

* Il backend utilizza un **RPC Pool Manager** per gestire connessioni Solana multiple con health check e backoff automatico
* Tutte le operazioni RPC devono usare `RpcPoolManager.pickRpcConnection(profileId)` per evitare istanze sparse
* La cache viene salvata in `cache/<PROFILEID>/` per ogni profilo analizzato
* Il decoder Rust viene invocato dal backend per parsing ottimizzato dei dati blockchain

***

## 📄 Licenza
Questo progetto è concesso in licenza sotto la Licenza MIT. Vedi [LICENSE](LICENSE) per i dettagli.

pkill -9 node; cd ~/sae ;rm -rf log cache dist; sleep 1; npm run build && mkdir -p log && nohup npm run dev > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &    

pkill -9 node; cd ~/sae; rm -rf dist frontend/dist log cache; sleep 1; npm run build && pm2 start dist/app.js --name sae --log log/pm2-sae.log

git add . && git commit -m "wallet connection gui" && git push -f origin main       