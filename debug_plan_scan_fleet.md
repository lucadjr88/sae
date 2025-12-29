# Piano di Debug per Associazione Transazioni "Scan Fleet"

## Contesto del Problema
- **Fleet "Scan Fleet"**: Account EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg
- **Wallet**: 9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY
- **Profile ID**: 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8
- **Problema**: Le transazioni esistono (visibili nei log), ma non vengono associate correttamente a "Scan Fleet" in feesByFleet, quindi non appaiono nel frontend.

## Passi del Piano

### 1. Verifica Stato del Server
- Assicurarsi che il server sia in esecuzione su localhost:3000
- Comando: `npm start` (se non già attivo)
- Verificare che non ci siano errori di porta (EADDRINUSE)

### 2. Aggiunta Logging per Debug
- Aggiungere console.log in `wallet-sage-fees-streaming.ts` per stampare:
  - feesByFleet alla fine del processamento
  - Specificamente controllare se esiste una entry per "EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg"
  - Loggare quando una transazione viene associata a un fleet
- Ricostruire il progetto: `npm run build`

### 3. Test API con Refresh Completo
- Eseguire richiesta API corretta con POST
- Comando: `curl -X POST "http://localhost:3000/api/wallet-sage-fees-detailed" -H "Content-Type: application/json" -d '{"walletPubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY", "refresh": true}' > debug_response.json`
- Salvare la risposta completa in un file per analisi

### 4. Analisi della Risposta
- Controllare se feesByFleet è presente nella risposta
- Se presente, verificare se contiene dati per "Scan Fleet"
- Se assente, investigare perché non viene inviato
- Usare grep per cercare "EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg" nella risposta per confermare presenza transazioni

### 5. Debug Logica Associazione
- Se feesByFleet è vuoto per "Scan Fleet" nonostante transazioni:
  - Verificare logica in `wallet-sage-fees-streaming.ts` per associazione fleet
  - Controllare se le transazioni coinvolgono account fleet correttamente
  - Verificare se il fleet è marcato come rented correttamente
- Aggiungere logging dettagliato per ogni transazione: quale fleet viene associato e perché

### 6. Verifica Cache e Incremental Update
- Con refresh=true, isIncrementalUpdate dovrebbe essere false
- Verificare che non si usi cache vecchia
- Controllare che feesByFleet venga resettato correttamente

### 7. Test Frontend
- Una volta risolto il backend, verificare che il frontend mostri correttamente "Scan Fleet" con fees > 0
- Controllare che completeFeesByFleet includa tutti i fleet, anche quelli con 0 fees

### 8. Pulizia
- Rimuovere console.log aggiunti per debug
- Ricostruire e testare finale

## API Corrette da Usare

Basandosi su `api-list.md` e codice sorgente:

- **Endpoint Principale**: `POST /api/wallet-sage-fees-detailed`
  - Body JSON: `{"walletPubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY", "refresh": true}`
  - Restituisce feesByFleet con breakdown per fleet
  - Supporta cache (refresh=true forza ricalcolo)

- **Endpoint Streaming**: `GET /api/wallet-sage-fees-stream?wallet=...&refresh=true`
  - Invia aggiornamenti parziali via streaming
  - Utile per debug in tempo reale, ma risposta non JSON valido

- **Wallet vs Profile ID**:
  - Wallet: `9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY` (indirizzo Solana del wallet)
  - Profile ID: `4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8` (ID profilo SAGE)

Usare walletPubkey nel body per l'endpoint detailed.</content>
<parameter name="filePath">/home/luca/Scaricati/sae-main/debug_plan_scan_fleet.md