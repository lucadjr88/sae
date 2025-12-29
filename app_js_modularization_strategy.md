# Strategia di Modularizzazione per `/public/app.js`

## Obiettivo della Modularizzazione
Il file `app.js` attuale è un singolo file di 1257 righe che gestisce molteplici responsabilità. La modularizzazione mira a:
- Migliorare la manutenibilità separando le responsabilità
- Facilitare il testing isolato dei componenti
- Ridurre l'accoppiamento tra funzioni
- Migliorare la leggibilità e l'organizzazione del codice

## Analisi delle Responsabilità Attuali
Il file attuale contiene le seguenti categorie di funzionalità:
1. **Helper UI**: Aggiornamento celle, formattazione, progress indicators
2. **Gestione Cache**: Update, refresh, wipe delle cache
3. **Display Risultati**: Rendering risultati parziali e completi
4. **Gestione Liste**: Creazione liste flotte e operazioni
5. **Grafici**: Disegno e gestione grafici a torta
6. **Event Handling**: Setup event listeners DOM
7. **Utility Functions**: Formattazione timestamp, toggle elementi

## Strategia di Modularizzazione Proposta

### 1. Modulo `ui-helpers.js`
**Responsabilità**: Funzioni di utilità per l'interfaccia utente

**Funzioni da spostare**:
- `updateDetailCell()`
- `updateAllDetailCells()`
- `updateProgress()`
- `formatTimestamp()`
- `showFees()`
- `toggleFleet()`

**Dipendenze**:
- Import da `./js/state.js` per variabili di stato
- Import da `./js/utils.js` per utility esistenti

**Struttura del file**:
```javascript
// public/js/ui-helpers.js
import { copyToClipboard, inferRecipeName, inferMaterialLabel } from '../js/utils.js';
import { currentProfileId, analysisStartTime, progressInterval, lastAnalysisParams, txDetailsCache, setCurrentProfileId, setAnalysisStartTime, setProgressInterval, setLastAnalysisParams, clearTxDetailsCache } from '../js/state.js';

// Helper to update a detail cell with decoded transaction data
export function updateDetailCell(cellId, decoded) {
  // ... codice esistente
}

// Helper to update all cells with the same txid across both sections
export function updateAllDetailCells(txid, decoded) {
  // ... codice esistente
}

// Helper to update progress message
export function updateProgress(message) {
  // ... codice esistente
}

// Global helper to format timestamps used across the UI
export function formatTimestamp(ts) {
  // ... codice esistente
}

// Tabs handling
export function showFees() {
  // ... codice esistente
}

export function toggleFleet(fleetId) {
  // ... codice esistente
}
```

### 2. Modulo `cache-manager.js`
**Responsabilità**: Gestione completa delle operazioni di cache

**Funzioni da spostare**:
- `updateCache()`
- `wipeAndReload()`
- `refreshAnalysis()`

**Dipendenze**:
- Import da `./js/state.js`
- Import da `./ui-helpers.js` per `updateProgress()`
- Import da `./results-display.js` per `displayResults()`
- Fetch API per chiamate HTTP

**Struttura del file**:
```javascript
// public/js/cache-manager.js
import { currentProfileId, analysisStartTime, progressInterval, lastAnalysisParams, setAnalysisStartTime, setProgressInterval } from '../js/state.js';
import { updateProgress } from './ui-helpers.js';
import { displayResults } from './results-display.js';

export async function updateCache() {
  // ... codice esistente, adattato per import
}

export async function wipeAndReload() {
  // ... codice esistente, adattato per import
}

export async function refreshAnalysis() {
  // ... codice esistente, adattato per import
}
```

### 3. Modulo `results-display.js`
**Responsabilità**: Rendering e visualizzazione dei risultati dell'analisi

**Funzioni da spostare**:
- `displayPartialResults()`
- `displayResults()`

**Dipendenze**:
- Import da `./ui-helpers.js` per utility
- Import da `./charts.js` per grafici
- Import da `./fleet-operations.js` per liste
- Chart.js (globale)
- `window.prices` per conversioni valuta

**Struttura del file**:
```javascript
// public/js/results-display.js
import { formatTimestamp } from './ui-helpers.js';
import { drawPieChart } from './charts.js';
import { createFleetList, createOperationList } from './fleet-operations.js';

export function displayPartialResults(update, fleets, fleetRentalStatus) {
  // ... codice esistente
}

export function displayResults(data, fleetNames, rentedFleetNames = new Set()) {
  // ... codice esistente, con import per drawPieChart, createFleetList, createOperationList
}
```

### 4. Modulo `fleet-operations.js`
**Responsabilità**: Creazione e gestione delle liste di flotte e operazioni

**Funzioni da spostare**:
- `createFleetList()`
- `createOperationList()`
- `renderCraftingDetailsRows()` (se presente)

**Dipendenze**:
- Import da `../js/utils.js` per utility
- `window.prices` per conversioni valuta

**Struttura del file**:
```javascript
// public/js/fleet-operations.js
import { inferMaterialLabel } from '../js/utils.js';

export function createFleetList(data, fleetNames, rentedFleetNames = new Set()) {
  // ... codice esistente
}

export function createOperationList(data, fleetNames, rentedFleetNames = new Set()) {
  // ... codice esistente
}

// Se presente nel codice originale
export function renderCraftingDetailsRows(details, maxDetails) {
  // ... codice esistente
}
```

### 5. Modulo `charts.js`
**Responsabilità**: Gestione dei grafici e visualizzazioni dati

**Funzioni da spostare**:
- `drawPieChart()`

**Dipendenze**:
- Chart.js (globale)
- `window.prices` per conversioni valuta

**Struttura del file**:
```javascript
// public/js/charts.js

export function drawPieChart(canvasId, legendId, data, prices) {
  // ... codice esistente
}
```

### 6. Modulo `event-setup.js`
**Responsabilità**: Setup iniziale degli event listeners

**Codice da spostare**:
- Tutto il blocco `document.addEventListener('DOMContentLoaded', ...)`
- Setup del ticker dei prezzi

**Dipendenze**:
- Import da `../js/app/ticker.js`
- Import da `./cache-manager.js` per funzioni cache
- Import da `./ui-helpers.js` per `setSidebarVisible()` (se esiste)

**Struttura del file**:
```javascript
// public/js/event-setup.js
import { updatePriceTicker } from '../js/app/ticker.js';
import { updateCache, refreshAnalysis, wipeAndReload } from './cache-manager.js';
// Import setSidebarVisible se esiste in ui-helpers o state

document.addEventListener('DOMContentLoaded', () => {
  // Price ticker fetch and update
  updatePriceTicker(/* renderPriceTicker function */);
  setInterval(() => updatePriceTicker(/* renderPriceTicker function */), 60000);
  
  // Cache button handlers
  const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');
  // ... resto del codice esistente
});
```

## File `app.js` Rifattorizzato
Il file principale diventerebbe un semplice orchestratore:

```javascript
// public/app.js
import './js/ui-helpers.js';
import './js/cache-manager.js';
import './js/results-display.js';
import './js/fleet-operations.js';
import './js/charts.js';
import './js/event-setup.js';

// Esport eventuali funzioni che devono rimanere globali
export { displayResults } from './js/results-display.js';
export { updateProgress } from './js/ui-helpers.js';
```

## Gestione delle Dipendenze Specifiche

### Variabili Globali
- `window.prices`: Accessibile direttamente in tutti i moduli
- `window` object per altre proprietà globali

### Funzioni che Diventano Globali
Alcune funzioni potrebbero dover rimanere accessibili globalmente:
- `toggleFleet()`: Usata negli onclick degli elementi HTML
- `displayResults()`: Potrebbe essere chiamata da altri script

**Soluzione**: Esportarle da `app.js` o renderle disponibili globalmente:
```javascript
// In app.js
import { toggleFleet, displayResults } from './js/ui-helpers.js';
window.toggleFleet = toggleFleet;
window.displayResults = displayResults;
```

### Gestione Timestamp
La funzione `formatTimestamp()` appare due volte nel codice originale. Consolidare in una singola implementazione in `ui-helpers.js`.

## Testing Strategy per Ogni Modulo

### 1. `ui-helpers.js`
```javascript
// Test example
describe('updateDetailCell', () => {
  test('updates cell with crafting details', () => {
    document.body.innerHTML = '<div id="test-cell"></div>';
    const decoded = { /* mock data */ };
    updateDetailCell('test-cell', decoded);
    expect(document.getElementById('test-cell').innerHTML).toContain('Crafting');
  });
});
```

### 2. `cache-manager.js`
```javascript
// Test con mock fetch
describe('updateCache', () => {
  test('calls API with correct parameters', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) }
    }));
    
    await updateCache();
    expect(fetch).toHaveBeenCalledWith('/api/wallet-sage-fees-stream?update=true', expect.any(Object));
  });
});
```

### 3. `results-display.js`
```javascript
describe('displayResults', () => {
  test('renders charts and tables', () => {
    document.body.innerHTML = '<div id="results"></div><canvas id="fleetChart"></canvas>';
    const data = { /* mock data */ };
    displayResults(data, {}, new Set());
    expect(document.getElementById('results').innerHTML).toContain('analysis-period');
  });
});
```

## Migrazione Passo-Passo con Codice

### Passo 1: Creare `ui-helpers.js`
1. Copiare le funzioni helper da `app.js` a `ui-helpers.js`
2. Aggiornare gli import relativi
3. Aggiungere export per ogni funzione
4. Testare che il modulo si importi correttamente

### Passo 2: Creare `charts.js`
1. Il modulo `charts.js` ha poche dipendenze, ideale per iniziare
2. Copiare `drawPieChart()` 
3. Verificare che Chart.js sia disponibile globalmente

### Passo 3: Creare `fleet-operations.js`
1. Copiare `createFleetList()` e `createOperationList()`
2. Gestire dipendenze da `inferMaterialLabel`
3. Aggiungere `renderCraftingDetailsRows()` se necessario

### Passo 4: Creare `results-display.js`
1. Copiare `displayResults()` e `displayPartialResults()`
2. Sostituire chiamate dirette con import dai nuovi moduli
3. Aggiornare riferimenti a funzioni helper

### Passo 5: Creare `cache-manager.js`
1. Questo è il modulo più complesso
2. Copiare le tre funzioni di cache
3. Aggiornare tutti gli import e riferimenti
4. Gestire la dipendenza circolare con `displayResults`

### Passo 6: Creare `event-setup.js`
1. Estrarre tutto il codice da `DOMContentLoaded`
2. Aggiornare riferimenti alle funzioni di cache
3. Mantenere setup del ticker

### Passo 7: Refactoring `app.js`
1. Sostituire tutto il contenuto con gli import
2. Aggiungere eventuali funzioni globali necessarie
3. Testare che l'applicazione funzioni completamente

## Gestione Errori Comuni

### 1. ReferenceError: function is not defined
**Causa**: Funzione spostata in altro modulo ma ancora referenziata nel vecchio posto
**Soluzione**: Verificare tutti i riferimenti e aggiornare import

### 2. Circular Dependency
**Causa**: Modulo A importa da B, B importa da A
**Soluzione**: Ristrutturare per evitare cicli (es. spostare funzioni comuni)

### 3. Global Variables Not Available
**Causa**: `window.prices` o altre variabili globali non disponibili nel contesto del modulo
**Soluzione**: Assicurarsi che gli script siano caricati nell'ordine corretto

## Ottimizzazioni Post-Migrazione

### 1. Tree Shaking
- Utilizzare bundler che rimuovono codice non utilizzato
- Verificare che funzioni non esportate siano eliminate

### 2. Lazy Loading
- Per moduli non critici, considerare caricamento dinamico:
```javascript
const { drawPieChart } = await import('./charts.js');
```

### 3. Bundle Splitting
- Separare vendor code (Chart.js) da application code
- Caricare Chart.js solo quando necessario

Questa strategia dettagliata fornisce una roadmap completa per la modularizzazione, riducendo significativamente il carico cognitivo durante l'implementazione.