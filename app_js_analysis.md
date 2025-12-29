# Analisi Dettagliata del File `/public/app.js`

## Scopo del File
Questo file JavaScript rappresenta il cuore dell'interfaccia utente dell'applicazione web per l'analisi delle fees di wallet in Star Atlas. Gestisce la visualizzazione dei risultati dell'analisi delle transazioni, inclusi grafici a torta, tabelle dettagliate delle flotte e operazioni, e funzionalità di cache (aggiornamento, refresh, wipe).

## Dipendenze e Import
Il file importa moduli da altri file JavaScript locali:
- `copyToClipboard`, `inferRecipeName`, `inferMaterialLabel` da `./js/utils.js`
- Variabili di stato da `./js/state.js`: `currentProfileId`, `analysisStartTime`, `progressInterval`, `lastAnalysisParams`, `txDetailsCache`, e funzioni setter
- `updatePriceTicker`, `renderPriceTicker` da `./js/app/ticker.js`

## Struttura Generale
Il file è organizzato in diverse sezioni:
1. **Helper Functions**: Funzioni di utilità per aggiornare l'UI
2. **Event Listeners**: Gestione degli eventi DOM al caricamento della pagina
3. **Cache Management**: Funzioni per aggiornare, refreshare e pulire la cache
4. **Analysis Functions**: Logica principale per analizzare e visualizzare i dati
5. **UI Rendering**: Funzioni per creare liste, grafici e tabelle

## Funzioni Principali

### Helper Functions
- `updateDetailCell(cellId, decoded)`: Aggiorna una cella di dettaglio con dati decodificati di transazioni crafting
- `updateAllDetailCells(txid, decoded)`: Aggiorna tutte le celle con lo stesso txid
- `updateProgress(message)`: Aggiorna il messaggio di progresso durante l'analisi
- `formatTimestamp(ts)`: Formatta timestamp per la visualizzazione
- `showFees()`: Mostra la vista delle fees (tab singolo)

### Cache Management
- `updateCache()`: Aggiorna la cache in modo incrementale usando parametri salvati
- `wipeAndReload()`: Pulisce completamente la cache e ricarica i dati
- `refreshAnalysis()`: Rinfresca l'analisi forzando il recupero di nuovi dati delle flotte

### Analysis e Display
- `displayPartialResults(update, fleets, fleetRentalStatus)`: Mostra risultati parziali durante l'analisi in corso
- `displayResults(data, fleetNames, rentedFleetNames)`: Visualizza i risultati finali completi con grafici e tabelle
- `createFleetList(data, fleetNames, rentedFleetNames)`: Crea la lista dettagliata delle flotte
- `createOperationList(data, fleetNames, rentedFleetNames)`: Crea la lista delle operazioni
- `toggleFleet(fleetId)`: Espande/comprime i dettagli di una flotta
- `drawPieChart(canvasId, legendId, data, prices)`: Disegna grafici a torta usando Chart.js

### Utility Functions
- `renderCraftingDetailsRows(details, maxDetails)`: (Non mostrata nel codice fornito, ma chiamata) - Renderizza righe di dettagli per operazioni di crafting

## Variabili Globali
Il file non definisce variabili globali proprie, ma utilizza quelle importate da `./js/state.js` e accede a `window.prices` per i prezzi delle criptovalute.

## Gestione degli Eventi
- Al `DOMContentLoaded`: Imposta event listeners per pulsanti di cache, aggiorna il ticker dei prezzi ogni minuto
- Gestione tab per la vista fees (sebbene sia l'unica vista attualmente)

## Interazioni con il Backend
Il file effettua richieste HTTP a endpoint API:
- `/api/wallet-sage-fees-stream`: Per analisi streaming delle fees
- `/api/cache/wipe`: Per pulire la cache
- `/api/fleets`: Per recuperare dati delle flotte

## Caratteristiche dell'UI
- **Grafici**: Due grafici a torta (fees per flotta e per operazione) usando Chart.js
- **Tabelle**: Liste espandibili per flotte e operazioni con dettagli delle transazioni
- **Stati Visivi**: Indicatori per flotte affittate, stati della cache (fresca/stale)
- **Progress Indicators**: Messaggi di progresso con timer durante le operazioni lunghe
- **Responsive Design**: Layout con griglie e carte per statistiche

## Gestione Errori
Include try-catch blocks per gestire errori nella formattazione dei dati e parsing JSON, con fallback a messaggi di errore nell'UI.

## Ottimizzazioni
- Limite di 50 dettagli mostrati per evitare pagine troppo lunghe
- Uso di Server-Sent Events (SSE) per aggiornamenti in tempo reale durante l'analisi
- Caching delle transazioni per ridurre le richieste ripetute

## Note Tecniche
- Utilizza ES6 modules per gli import
- Dipende da Chart.js per i grafici (non importato direttamente, probabilmente caricato globalmente)
- Gestisce conversioni SOL/USD usando prezzi da `window.prices`
- Supporta sia dati legacy che nuovi formati per retrocompatibilità