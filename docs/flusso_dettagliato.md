# Flusso Dettagliato Backend SAGE

## 1. Derivazione walletAuthority e feePayer
- Funzione: `deriveWalletAuthority`
- File: `src/utils/deriveWalletAuthority.ts`

## 2. Fetch transazioni walletAuthority/feePayer
- Funzione: `fetchAllProfileWalletTxs`
- File: `src/analysis/fetchAllProfileWalletTxs.ts`
- Usa: `fetchAndCacheWalletTxs` (`src/utils/fetchAndCacheWalletTxs.ts`)
- Normalizza: `normalizeRawTx` (`src/utils/normalizeRawTx.ts`)

## 3. Decodifica istruzioni SAGE/Carbon
- Funzione: `decodeInstructions`
- File: `src/decoders/decodeInstructions.ts`
- Chiamata da: `decodeAllFleetInstructions` (`src/analysis/decodeFleetInstructions.ts`)
- Usa decoder Rust/Carbon se presente

## 4. Fetch fleets associate e in rent
- Funzioni: `fetchProfileFleets`, `fetchRentedFleets`
- File: `src/utils/fetchProfileFleets.ts`, `src/utils/fetchRentedFleets.ts`

## 5. Associazione ops↔fleets
- Funzione: `associateOpsToFleets`
- File: `src/analysis/associateOpsToFleets.ts`
- Match su fleetid/cargoid/ammoid/fuelid (accounts e decoded)

## 6. Aggregazione statistiche
- Funzione: `aggregateFleetStats`
- File: `src/analysis/aggregateFleetStats.ts`

## 7. Salvataggi cache
- Breakdown/player-ops: `saveBreakdownAndPlayerOps` (`src/analysis/saveBreakdownAndPlayerOps.ts`)
- Fleets/rented-fleets: `saveFleetsAndRented` (`src/analysis/saveFleetsAndRented.ts`)
- Metadati profilo: `saveProfileMetadata` (`src/analysis/saveProfileMetadata.ts`)
- Unknown ops: `saveUnknownOps` (`src/analysis/saveUnknownOps.ts`)
- Tutti usano: `setCache` (`src/utils/cache.ts`)

## 8. Orchestrazione
- File principale: `src/analysis/fleetOrchestrator.ts`
- Sequenza: fetch fleets → derive wallet → fetch tx → decode → associa → aggrega → salva

## 9. Entry point API
- File: `src/analysis/analyzeProfile.ts` (router)
- Server: `src/app.ts`

---

Tutti i riferimenti sono modulari, ogni step è isolato e testabile. Per dettagli shape dati vedi i singoli file.