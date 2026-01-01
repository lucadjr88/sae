# Analisi problema: feesByFleet vuoto nonostante transazioni presenti

## 1. Contesto
- **Wallet analizzato:** 9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY
- **API chiamata:** `/api/wallet-sage-fees-detailed` (POST)
- **Aspettativa:** feesByFleet popolato con operazioni raggruppate per fleet e per istruzione raw.
- **Risultato attuale:** feesByFleet restituito come oggetto vuoto (`{}`), mentre l'array `transactions` contiene molte transazioni raw.

## 2. Stato attuale del backend
- La logica aggiornata raggruppa le operazioni per nome istruzione raw in `feesByFleet[...].operations`.
- Se nessuna fleet viene popolata, feesByFleet resta vuoto.

## 3. Possibili cause tecniche
### a) Mappatura fleet-transazione fallita
- La logica backend associa una transazione a una fleet solo se almeno una chiave in `tx.accountKeys` corrisponde a una delle fleetAccounts passate o mappate.
- Se nessuna chiave delle transazioni corrisponde alle fleetAccounts, la transazione non viene attribuita a nessuna fleet.

### b) Parametri passati all'API
- Il frontend chiama `/api/wallet-sage-fees-detailed` passando `walletPubkey`, `fleetAccounts`, `fleetNames`, `fleetRentalStatus`.
- Se `fleetAccounts` è vuoto o non contiene gli account effettivamente presenti in `accountKeys` delle transazioni, nessuna transazione viene associata a una fleet.

### c) Sub-account mapping
- Se la mappatura sub-account (abilitata di default) non trova corrispondenze tra fleetAccounts e accountKeys delle transazioni, nessuna fleet viene popolata.

## 4. Debug step-by-step
1. **Verificare i parametri passati dal frontend**
   - Controllare che `fleetAccounts` contenga effettivamente gli account delle flotte attive del wallet.
2. **Verificare i dati delle transazioni**
   - Controllare che almeno una chiave in `accountKeys` delle transazioni corrisponda a una fleetAccount.
3. **Verificare la funzione di mapping**
   - La funzione `buildAccountToFleetMap` deve mappare correttamente tutti i sub-account delle flotte.
4. **Verificare fallback**
   - Se nessuna fleet viene popolata, la logica dovrebbe almeno popolare la chiave 'All Fleets' con tutte le transazioni.

## 5. Azioni consigliate
- **Loggare** i parametri in ingresso e le corrispondenze trovate tra fleetAccounts e accountKeys.
- **Verificare** che la lista fleetAccounts passata dal frontend sia corretta e aggiornata.
- **Aggiungere fallback**: se nessuna fleet viene popolata, popolare 'All Fleets' con tutte le transazioni (già presente nella logica, ma da verificare che venga attivato).

## 6. Prossimi passi
- Eseguire una chiamata API con log dettagliati di fleetAccounts e accountKeys.
- Se il problema persiste, forzare la visualizzazione di 'All Fleets' come fallback.
- Validare che il frontend usi la chiave 'All Fleets' se feesByFleet è vuoto.

---

**Nota:** Il wallet contiene transazioni, ma la logica di associazione fleet-transazione potrebbe non trovare match a causa di parametri o mapping non allineati. Serve debug mirato su parametri e matching.
