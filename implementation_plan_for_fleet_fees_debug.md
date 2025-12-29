# Piano di Implementazione per Debug e Fix delle Fee delle Flotte Noleggiate

## Contesto del Problema
- **Obiettivo**: Assicurare che le flotte noleggiate (es. "Scan Fleet") mostrino correttamente le transazioni associate e le fee nel frontend.
- **Sintomi**: 
  - "Scan Fleet" appare nel frontend con nome corretto e status noleggiato.
  - Transazioni esistono ma non vengono associate correttamente alla flotta.
  - `feesByFleet` non appare nella risposta API streaming.
- **Chiavi Importanti**:
  - Profile ID: `4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8`
  - Wallet: `9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY`
  - Fleet Key "Scan Fleet": `EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg`

## Analisi del Codice
- **Backend**: `walletSageFeesStreaming/index.ts` calcola e include `feesByFleet` nella risposta.
- **Streaming**: `wallet-sage-fees-streaming.ts` invia aggiornamenti parziali con `feesByFleet`.
- **Risposta**: La risposta è streaming JSON, concatenazione di oggetti. L'ultimo oggetto ha `rentedFleetAccounts`, `fleetAccountNamesEcho`, `fleetRentalStatusFinal`, ma manca `feesByFleet`.
- **Possibile Causa**: `feesByFleet` inviato in aggiornamenti intermedi, non catturato nella risposta salvata, o errore nella logica di associazione.

## Piano di Azione Dettagliato

### Fase 1: Verifica del Backend - Conferma che feesByFleet viene calcolato e inviato
1. **Esamina il codice di streaming** (`src/examples/wallet-sage-fees-streaming.ts`):
   - Verifica che `feesByFleet` venga popolato correttamente per ogni flotta coinvolta.
   - Assicurati che per "Scan Fleet" (`EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg`), le transazioni vengano attribuite.
   - Controlla la logica di `isIncrementalUpdate`: quando `refresh=true`, deve essere `false` per ricalcolare tutto.

2. **Aggiungi logging temporaneo**:
   - In `wallet-sage-fees-streaming.ts`, aggiungi `console.log` per stampare `feesByFleet` prima di `sendUpdate`.
   - Esempio: `console.log('DEBUG: feesByFleet for update:', JSON.stringify(feesByFleet, null, 2));`

3. **Test del backend isolato**:
   - Esegui il servizio streaming con `refresh=true`.
   - Cattura l'output console per verificare se `feesByFleet` include "Scan Fleet" con fee > 0.

### Fase 2: Debug della Risposta Streaming
1. **Modifica la cattura della risposta**:
   - Invece di salvare tutto in un file, usa `curl` con `--raw` o analizza riga per riga.
   - Usa `jq` per filtrare oggetti che contengono `feesByFleet`.

2. **Verifica aggiornamenti parziali**:
   - La risposta streaming invia più oggetti JSON.
   - Cerca `feesByFleet` in ogni oggetto della risposta.

3. **Confronta con risposta precedente**:
   - Confronta la risposta con `refresh=false` vs `refresh=true`.
   - Assicurati che con `refresh=true`, `feesByFleet` venga ricalcolato da zero.

### Fase 3: Verifica del Frontend
1. **Esamina `results-display.js`**:
   - Verifica come `completeFeesByFleet` viene costruito e visualizzato.
   - Assicurati che flotte con fee = 0 vengano incluse se hanno transazioni.

2. **Debug del caricamento dati**:
   - Aggiungi `console.log` in `cache-manager.js` per vedere cosa riceve dal backend.
   - Verifica che `feesByFleet` arrivi al frontend.

3. **Test visuale**:
   - Dopo fix backend, ricarica il frontend e controlla se "Scan Fleet" mostra fee.

### Fase 4: Iterazione e Test
1. **Test con dati specifici**:
   - Usa il wallet `9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY`.
   - Verifica transazioni per "Scan Fleet" negli ultimi 24h.

2. **Comandi di test**:
   - `curl -X POST http://localhost:3000/api/fleets -H "Content-Type: application/json" -d '{"refresh": true}'`
   - Salva risposta e cerca `feesByFleet`.

3. **Metriche di successo**:
   - "Scan Fleet" appare con fee > 0.
   - Transazioni associate correttamente.
   - Nessun errore in console.

### Fase 5: Pulizia e Ottimizzazione
1. **Rimuovi logging temporaneo**.
2. **Ottimizza caching**: Assicurati che il refresh funzioni correttamente senza sovrascrivere dati buoni.
3. **Documenta le modifiche**.

## Timeline Stimata
- Fase 1: 1-2 ore
- Fase 2: 1 ora
- Fase 3: 1 ora
- Fase 4: 2 ore
- Fase 5: 30 min

## Rischi e Mitigazioni
- **Rischi**: Modifiche al codice potrebbero rompere altre funzionalità.
- **Mitigazioni**: Backup del codice, test incrementali, rollback se necessario.

## Note Finali
- Mantieni coerenza con i valori chiave forniti.
- Usa gli strumenti disponibili (grep, read_file, run_in_terminal) per investigare.
- Se necessario, chiedi chiarimenti all'utente.