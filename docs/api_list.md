
# API Backend SAGE – Elenco e Flusso

## Flusso Principale

1. Il frontend invia una richiesta di analisi tramite API, fornendo il `profileId` e parametri opzionali (`wipeCache`, `lats`).
2. Il backend recupera wallet authority e fee payer dal profilo.
3. Scarica tutte le transazioni delle ultime N ore (default 24h) per i wallet associati.
4. Decodifica le operazioni SAGE, separa le sconosciute.
5. Recupera fleets possedute e in rent.
6. Associa le operazioni alle fleets e produce breakdown dettagliati.
7. Restituisce i dati aggregati e dettagliati al frontend.

La cache locale viene aggiornata a ogni step per velocizzare richieste successive e abilitare debug/analisi raw.

---

## 1. POST /api/analyze-profile
- **Descrizione:** Avvia l’analisi completa delle operazioni SAGE per un determinato profileId.
- **Body JSON:**
  - `profileId` (string, richiesto): ID del profilo Star Atlas da analizzare
  - `wipeCache` (boolean, opzionale): se true, cancella la cartella <profileid> prima di avviare l'analisi.
  - `lats` (number, opzionale): ore di lookback (default 24)
- **Risposta:**
  - `fleets`: array fleets associate (con decodedInstructions)
  - `rentedFleets`: array fleets in rent
  - `walletAuthority`: wallet principale
  - `feePayer`: fee payer usato
  - `walletTxs`: array transazioni raw
  - `aggregation`: statistiche aggregate (fees, tx, unknown)
  - `fleetBreakdown`: breakdown ops associate a fleet/cargo/ammo/fuel
  - `playerOps`: ops non associate a fleet
- **File handler:** `src/analysis/analyzeProfile.ts`

---

## API di TEST FLUSSO Debug/Utility

### 1 GET /api/debug/get-wallet-authority?profileId=...
curl -s "http://localhost:3000/api/debug/get-wallet-authority?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8" | jq

- Restituisce il wallet authority associato al profilo.
- **Risposta:** `{ walletAuthority: string, ... }`


### 2 GET /api/debug/get-wallet-txs?profileId=...&cutoffH=...
curl -s "http://localhost:3000/api/debug/get-wallet-txs?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8&cutoffH=1" | jq  

- Scarica e salva le transazioni raw per tutti i wallet associati al profilo nelle ultime N ore (default 24h). Aggiorna la cache wallet-txs.
- **Risposta:** `{ profileId, cutoffH, results: [{ wallet, txCount }] }`


### 3 GET /api/debug/decode-sage-ops-full?wallet=...&lats=...&profileId=...
curl 'http://localhost:3000/api/debug/decode-sage-ops-full?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8'

- Decodifica tutte le operazioni SAGE per un wallet nelle ultime N ore (default 24h), con possibilità di specificare anche il profileId.
- **Risposta:** Oggetto `{ sageOps: [...], unknown: [...] }` con separazione tra operazioni SAGE decodificate e sconosciute.


### 4 GET /api/debug/get-fleets?profileId=...
curl -s 'http://localhost:3000/api/debug/get-fleets?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8' | jq

- Descrizione: Recupera tutte le fleets possedute dal `profileId` usando `getProgramAccounts` + decoding Borsh.
- Effetti collaterali: salva ogni fleet decodificata in `cache/<PROFILEID>/fleets/<fleetPubkey>.json`.
- Parametri query: `profileId` (string, richiesto)
- **Risposta:** Array di oggetti fleet (decoded JSON) — vuoto se non trovate o in caso di errore.


### 5 GET /api/debug/get-rented-fleets?profileId=...
curl -s 'http://localhost:3000/api/debug/get-rented-fleets?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8' | jq

- Descrizione: Recupera tutte le fleets attualmente in rent collegate al `profileId`. Usa `getProgramAccounts` sul programma SRSLY e decodifica i `ContractState` dei contratti di rent.
- Effetti collaterali: salva ogni contratto di rent in `cache/<PROFILEID>/rented-fleets/<contractPubkey>.json` e, se possibile, salva la relativa `fleet` decodificata in `cache/<PROFILEID>/fleets/<fleetPubkey>.json`.
- Parametri query: `profileId` (string, richiesto)
- **Risposta:** Oggetto `{ profileId, rentedFleets }` dove `rentedFleets` è un array di contract objects (ogni oggetto può includere il campo `fleetData` con la fleet decodificata quando disponibile).



### 6 GET /api/debug/associate-sage-ops-to-fleets?profileId=...
  curl -s 'http://localhost:3000/api/debug/associate-sage-ops-to-fleets?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8' | jq

### 7 GET /api/debug/playload?profileId=...&wipeCache=...
curl -s 'http://localhost:3000/api/debug/playload?profileId=4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8&wipeCache=on' | jq

- Descrizione: Avvia l'orchestrazione completa del flusso per il `profileId` (deriva wallets, scarica tx, decodifica ops SAGE, recupera fleets e rented-fleets, associa ops alle fleets, salva breakdown e player-ops in cache) e restituisce il `playload` aggregato per il frontend. Per default elabora l'intero contenuto della cache (nessun cutoff temporale).
- Parametri query:
  - `profileId` (string, richiesto): ID del profilo Star Atlas da analizzare
  - `wipeCache` (boolean, opzionale se true elimina la cartella <playerprofileid> in cache): 
- Risposta: Oggetto contenente i medesimi campi della funzione `orchestrateFleetsForProfile`:
  - `fleets`: array fleets associate (con `decodedInstructions`)
  - `rentedFleets`: array fleets in rent
  - `walletAuthority`: wallet principale
  - `feePayer`: fee payer usato
  - `walletTxs`: array transazioni raw
  - `aggregation`: statistiche aggregate (fees, tx, unknown)
  - `fleetBreakdown`: breakdown ops associate a fleet/cargo/ammo/fuel
  - `playerOps`: ops non associate a fleet
  - altri campi utili (vedi implementazione)
- Effetti collaterali: salva il payload in cache/<PROFILEID>/playload/latest.json (tramite `setCache`) e aggiorna le cartelle di cache previste dal flusso.
- File handler: `src/analysis/debug/playload.ts`


### ALTRE API per Debug/Utility
Queste API permettono di ispezionare, forzare refresh, estrarre dati raw e fare troubleshooting. Tutte le risposte sono in JSON.

### GET /api/debug/decode-profile-with-rust?profileId=...
- Decodifica un account profilo Star Atlas usando il decoder Rust, mostra anche le chiavi profilo.
- **Risposta:** JSON con parsed profile e chiavi

### GET /api/debug/dump-fleets?profileId=...
- Estrae e mostra tutte le fleets (owned/rented) associate a un profileId.
- **Risposta:** JSON con fleets possedute e in rent

### GET /api/debug/dump-profile-hex?profileId=...
- Scarica e salva l’account profilo in formato hex (debug basso livello).
- **Risposta:** Path file hex generato

### GET /api/debug/refresh-allowed-wallets?profileId=...
- Aggiorna e mostra la lista di allowed wallets per un profilo (debug accessi).
- **Risposta:** Array di wallet

### GET /api/debug/scan-profile-owner?profileId=...
- Scansiona l’account profilo per estrarre possibili pubkey owner (ascii e bs58 scan).
- **Risposta:** Array di pubkey candidate



### GET /api/debug/decode-sage-ops?wallet=...&lats=...
- Decodifica tutte le operazioni SAGE per un wallet nelle ultime N ore (default 24h).
- **Risposta:** Array di operazioni decodificate

### GET /api/debug/decode-sage-ops-full?wallet=...&lats=...&profileId=...
- Decodifica tutte le operazioni SAGE per un wallet nelle ultime N ore (default 24h), con possibilità di specificare anche il profileId.
- **Risposta:** Oggetto `{ sageOps: [...], unknown: [...] }` con separazione tra operazioni SAGE decodificate e sconosciute.

### GET /api/debug/get-fleets?profileId=...
curl -s "http://localhost:3000/api/debug/get-fleets?profileId=testprofileid" | jq

- Restituisce tutte le fleets possedute dal profilo.
- **Risposta:** Array di fleets

- Restituisce tutte le fleets possedute dal profilo.
- **Risposta:** Array di fleets



### GET /api/debug/associate-sage-ops-to-fleets?profileId=...
- Associa le operazioni SAGE alle fleets del profilo e restituisce il breakdown.
- **Risposta:** Breakdown dettagliato delle associazioni

---

## Note
- Tutte le risposte sono in formato JSON.
- Errori restituiti con HTTP status 4xx/5xx e campo `error` nella risposta.
- Per dettagli su shape dati e struttura cache vedi anche `docs/flusso_dettagliato.md` e `docs/flusso.md`.
- La struttura della cache è descritta in `docs/flusso.md`.
