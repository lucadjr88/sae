# Flusso Tecnico di POST /api/analyze-profile

La chiamata POST `/api/analyze-profile` esegue un'analisi completa delle operazioni SAGE per uno specifico `profileId`. Questa API aggrega e automatizza, in sequenza, tutte le funzioni offerte dagli endpoint di debug/utility, orchestrando il flusso end-to-end. Di seguito viene descritto il flusso tecnico dettagliato.

## 1. Ricezione Parametri
- Il frontend invia una richiesta POST con body JSON:
  - `profileId` (obbligatorio)
  - `wipeCache` (opzionale, forza il refresh della cache)
  - `lats` (opzionale, ore di lookback, default 24)

## 2. Recupero Wallet Authority e Fee Payer
- Viene chiamata la funzione equivalente a `GET /api/debug/get-wallet-authority?profileId=...`.
- Output: `{ walletAuthority, feePayer, ... }`

## 3. Download delle Transazioni Raw
- Per tutti i wallet associati al profilo, vengono scaricate le transazioni delle ultime N ore (default 24h), come in `GET /api/debug/get-wallet-txs?profileId=...&cutoffH=...`.
- Le transazioni vengono salvate in `cache/<PROFILEID>/wallet-txs/<wallet>/*.json`.

## 4. Decodifica delle Operazioni SAGE
- Tutte le transazioni vengono processate per decodificare le operazioni SAGE, come in `GET /api/debug/decode-sage-ops-full?profileId=...`.
- Output: `{ sageOps: [...], unknown: [...] }`
- Ogni SAGE op decodificata viene salvata in `cache/<PROFILEID>/sage-ops/<signature>.json`.

## 5. Recupero Fleets Possedute
- Vengono recuperate tutte le fleets possedute dal profilo, come in `GET /api/debug/get-fleets?profileId=...`.
- Ogni fleet decodificata viene salvata in `cache/<PROFILEID>/fleets/<fleetPubkey>.json`.

## 6. Recupero Fleets in Rent
- Vengono recuperate tutte le fleets attualmente in rent, come in `GET /api/debug/get-rented-fleets?profileId=...`.
- Ogni contratto di rent viene salvato in `cache/<PROFILEID>/rented-fleets/<contractPubkey>.json`.
- Se disponibile, la relativa fleet viene salvata in `cache/<PROFILEID>/fleets/<fleetPubkey>.json`.

## 7. Associazione SAGE Ops a Fleets
- Le operazioni SAGE vengono associate alle fleets/cargo/ammo/fuel, come in `GET /api/debug/associate-sage-ops-to-fleets?profileId=...`.
- Le associazioni vengono salvate in `cache/<PROFILEID>/fleet-breakdowns/` e le rimanenti in `cache/<PROFILEID>/player-ops/`.

## 8. Aggregazione e Risposta
- Vengono aggregate statistiche e dati:
  - `fleets`, `rentedFleets`, `walletAuthority`, `feePayer`, `walletTxs`, `aggregation`, `fleetBreakdown`, `playerOps`, ecc.
- Il risultato aggregato viene salvato in `cache/<PROFILEID>/playload/latest.json`.
- La risposta della API contiene tutti i dati utili per il frontend.

## 9. Effetti Collaterali
- Tutte le cartelle di cache vengono aggiornate secondo la struttura descritta in `docs/flusso.md`.
- Se `wipeCache` è attivo, la cache del profilo viene prima eliminata e poi ricostruita.

## 10. Riferimenti Implementativi
- Handler principale: `src/analysis/analyzeProfile.ts`
- Per dettagli su shape dati e struttura cache, vedi anche `docs/flusso.md` e `docs/api_list.md`.

---

**In sintesi:**
La POST `/api/analyze-profile` automatizza la sequenza di chiamate di debug, orchestrando l'intero flusso di analisi, download, decodifica, associazione e aggregazione dati per un determinato profilo Star Atlas, restituendo un payload completo e aggiornando la cache locale.