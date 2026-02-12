# SAE - Star Atlas Explorer

**SAE** è un'applicazione web per l'analisi delle operazioni SAGE (Star Atlas Game Engine) su blockchain Solana. Il progetto permette di tracciare, decodificare e visualizzare tutte le attività di un giocatore Star Atlas nelle ultime 24 ore, con focus su flotte, mining, crafting e gestione risorse.

---

## 🎯 Cosa Fa

SAE analizza le transazioni blockchain di un profilo giocatore Star Atlas e fornisce:

- **Tracking completo operazioni**: Decodifica tutte le transazioni SAGE (mining, movimento flotte, crafting, consumo risorse)
- **Analisi fleet**: Visualizza lo stato delle flotte possedute e in affitto
- **Breakdown dettagliato**: Associa operazioni a specifiche flotte, cargo, munizioni e carburante
- **Aggregazione statistiche**: Fee totali, punti guadagnati, risorse consumate
- **Interfaccia web moderna**: Grafici interattivi, ticker prezzi real-time, export dati

---

## 🏗️ Architettura

Il progetto è composto da:

### Backend (Node.js + TypeScript)
- **API REST** per analisi profili (`/api/analyze-profile`)
- **Decoder Rust** per parsing ottimizzato dei dati blockchain
- **RPC Pool Manager** per gestione efficiente delle connessioni Solana RPC
- **Sistema di cache** locale per velocizzare analisi ripetute

### Frontend (Vanilla JS + Chart.js)
- Interfaccia single-page con visualizzazione dati in tempo reale
- Grafici operazioni, breakdown flotte, ticker prezzi
- Export JSON dei risultati

### Decoder (Rust)
- Decoder standalone per profili e flotte Star Atlas
- Basato su `carbon-player-profile-decoder`

---

## 🚀 Quick Start

### Prerequisiti

- Node.js 18+
- Rust (per build decoder)
- npm

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

---

## 📡 API Principali

### POST `/api/analyze-profile`

Avvia l'analisi completa delle operazioni SAGE per un profilo.

**Body JSON:**
```json
{
  "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
  "wipeCache": false,
  "lats": 24
}
```

**Parametri:**
- `profileId` (string, richiesto): ID del profilo Star Atlas da analizzare
- `wipeCache` (boolean, opzionale): cancella cache prima dell'analisi
- `lats` (number, opzionale): ore di lookback (default 24)

**Risposta:**
- `fleets`: array fleets possedute con operazioni decodificate
- `rentedFleets`: array fleets in affitto
- `walletAuthority`: wallet principale del giocatore
- `feePayer`: fee payer utilizzato
- `walletTxs`: transazioni raw analizzate
- `aggregation`: statistiche aggregate (fees, tx totali, unknown ops)
- `fleetBreakdown`: breakdown operazioni per fleet/cargo/ammo/fuel
- `playerOps`: operazioni non associate a specifiche fleets

---

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

---

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

---

## 🛠️ Tecnologie Utilizzate

- **Backend**: Node.js, TypeScript, Express
- **Frontend**: Vanilla JavaScript, Chart.js
- **Blockchain**: Solana Web3.js, Anchor
- **Decoder**: Rust, Borsh, carbon-player-profile-decoder
- **Build**: TypeScript Compiler, tsx

---

## 📝 Note Sviluppo

- Il backend utilizza un **RPC Pool Manager** per gestire connessioni Solana multiple con health check e backoff automatico
- Tutte le operazioni RPC devono usare `RpcPoolManager.pickRpcConnection(profileId)` per evitare istanze sparse
- La cache viene salvata in `cache/<PROFILEID>/` per ogni profilo analizzato
- Il decoder Rust viene invocato dal backend per parsing ottimizzato dei dati blockchain

---

## 📄 Licenza

Progetto per uso personale/educativo.
