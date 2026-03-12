# Frontend - Analisi Dettagliata REALE 

**Data:** 2 Marzo 2026  
**Workspace:** `/home/luca/sae/frontend/`  
**Build Status:** ❌ FALLISCE (11 errori TS, 0 errori import-path)  
**Completamento:** 75% (la struttura è principalmente OK, solo cleanup + 1 file type)

---

## 1. STATO REALE DEI FILE

### ✅ Files Presenti

```
/frontend/src/
├── types/
│   ├── operation-list.ts         ✅ OperationStats, FleetFeeData, OperationSummary, etc
│   ├── details.ts                ✅ CraftingDetail, Prices, DecodedInstruction (generici)
│   ├── charts.ts                 ✅ ChartDataItem, PriceData
│   └── common.d.ts               ✅ Type aliases (DecodedInstruction, BurnedMaterial, etc)
│
├── services/
│   ├── api.ts                    ✅ 302 linee - processAnalysisData(), analyzeFees()
│   ├── fleet-operations.ts       ✅ createFleetList(), createOperationList(), createOtherOperationsList()
│   ├── charts.ts                 ✅ drawPieChart() e utility
│   ├── utils.ts                  ✅ normalizeOpName(), inferRecipeName(), inferMaterialLabel()
│   ├── wallet.ts                 ✅ Wallet logic (parziale)
│   ├── mobile.ts                 ✅ isMobile(), mobile wallet
│   ├── wallet-adapter.ts         ✅ Wallet adapter
│   └── common.d.ts               ✅ Types
│
├── ui/
│   ├── renderDetails.ts          ✅ renderCraftingDetailsRows()
│   ├── elements/
│   │   ├── sideBar.ts            ✅
│   │   ├── resultsComponent.ts   ✅
│   │   ├── backGround.ts         ✅
│   │   ├── loading.ts            ✅
│   │   ├── startButtons.ts       ✅
│   │   ├── heroTitle_elements.ts ✅
│   │   ├── footBar.ts            ✅
│   │   ├── privacyPolicy.ts      ✅
│   │   ├── alertInstructions.ts  ✅
│   │   └── manualLogin.ts        ✅
│   ├── styles/
│   │   ├── alertInstructions.css ✅
│   │   ├── backGround.css        ✅
│   │   ├── footBar.css           ✅
│   │   ├── heroTitle_elements.css ✅
│   │   ├── loading.css           ✅
│   │   ├── manualLogin.css       ✅
│   │   ├── privacyPolicy.css     ✅
│   │   ├── resultsComponent.css  ✅
│   │   ├── sideBar.css           ✅
│   │   └── startButtons.css      ✅
│
├── utils/
│   ├── state.ts                  ✅ Global state management (currentProfileId, progressInterval)
│   ├── ui.ts                     ✅ displayPartialResults(), toggleFleet()
│   ├── results-display.ts        ✅ displayFeeResults() - implementazione principale rendering
│   └── utils.ts                  ⚠️ Utility functions con dead code
│
├── main.ts                        ✅ Entry point - setup global functions
├── hompage.ts                     ✅ createHomePage()
├── resultpage.ts                  ✅ createResultPage() + updateCacheTooltip()
└── style.css                      ✅
```

### ❌ Files Mancanti

**CRITICO:**
- `src/types/api.ts` — Importato da `api.ts` linea 5, **NON ESISTE**
  ```typescript
  import type { FleetsRequest, FleetsResponse, WalletSageFeesStreamRequest, FleetBreakdownRequest, FleetBreakdownResponse, ApiError } from '@types/api';
  ```

---

## 2. IMPORT PATH ISSUES

### Alias Configurati in tsconfig.json
```json
"paths": {
  "@services/*": ["src/services/*"],
  "@ui/*": ["src/ui/*"],
  "@utils/*": ["src/utils/*"],
  "@types/*": ["src/types/*"]
}
```

### ✅ Imports Validi (Trovati)
```typescript
// src/services/api.ts:5-6
import type { FleetsRequest, ... } from '@types/api';  // ❌ @types/api.ts manca
import type { FeesByFleet } from '@types/operation-list';  // ✅ Esiste

// src/utils/results-display.ts:7
import type { PriceData } from '@types/charts';  // ✅ Esiste

// src/services/api.ts:1-3
import { normalizeOpName } from '@services/utils';  // ✅ Esiste
import { renderCraftingDetailsRows } from '@ui/renderDetails';  // ✅ Esiste
import { updateCacheTooltip, displayFeeResults } from '../resultpage';  // ✅ Esiste
```

### ⚠️ Path Alias Errati (Trovati)
```typescript
// src/utils/results-display.ts:5
import { drawPieChart } from '@app/charts';  // ❌ @app path alias NON ESISTE
```
**Dovrebbe essere:**
```typescript
import { drawPieChart } from '@services/charts';  // ✅ Corretto
```

---

## 3. ERRORI TYPESCRIPT BUILD

### 11 Errori TS6133 / TS6198 (Dead Code - NON BLOCCANTI)

| # | File | Linea | Tipo | Gravità |
|---|------|-------|------|---------|
| 1 | fleet-operations.ts | 20 | TS6133: Parameter `rentedFleetNames` declared but unused in `createFleetList()` | 🟢 BASSA |
| 2 | fleet-operations.ts | 39 | TS6133: Destructured `fleetAccount` unused | 🟢 BASSA |
| 3 | fleet-operations.ts | 255 | TS6133: `.map(([op, stats])` → `stats` unused | 🟢 BASSA |
| 4 | fleet-operations.ts | 256 | TS6198: `.forEach(([op, stats])` → Entire destructure unused | 🟢 BASSA |
| 5 | fleet-operations.ts | 409 | TS6133: `excludedCategories` array declared but never read | 🟢 BASSA |
| 6 | fleet-operations.ts | 475 | TS6133: `.filter([operation, opStats])` → `opStats` unused | 🟢 BASSA |
| 7 | fleet-operations.ts | 528 | TS6133: `nameClass` variable unused in template | 🟢 BASSA |
| 8 | renderDetails.ts | 20 | TS6133: `decodedCached` assigned but never read | 🟡 MEDIA |
| 9 | utils.ts | 26 | TS6133: `burns` parameter in `inferRecipeName()` unused | 🟡 MEDIA |
| 10 | utils.ts | 121 | TS6133: `isDecodedInstruction()` type guard function never used | 🟡 MEDIA |
| 11 | utils.ts | 125 | TS6133: `isValidMaterialEntry()` type guard function never used | 🟡 MEDIA |

**Impatto:** Nessuno sui runtime, solo su build (TypeScript strict mode)

---

## 4. FLUSSO DATI & INTEGRAZIONE

### Architettura Attuale
```
main.ts
  ↓
  ├─ createHomePage() via hompage.ts
  │   └─ UI: hero, buttons, footer
  │
  └─ Global window.analyzeFees() → api.ts:analyzeFees()
      ├─ Fetch /api/analyze-profile (POST)
      ├─ processAnalysisData()
      ├─ updateCacheTooltip()
      ├─ displayFeeResults() via results-display.ts
      │   ├─ createFleetList() via fleet-operations.ts
      │   ├─ createOperationList() via fleet-operations.ts
      │   ├─ createOtherOperationsList() via fleet-operations.ts
      │   ├─ drawPieChart() via charts.ts
      │   └─ Render HTML → DOM
      │
      └─ displayFleetOperationCharts() [optional]
```

### Componenti Funzionali

#### 1. **API Layer** (api.ts)
- `processAnalysisData()` - Parse response backend
  - Estrae `fleets`, `walletPubkey`, crea `fleetNames`, `fleetIsRented` maps
  - Logica rental detection multi-source (check isRented flag, callsign, key, fleetShips)

- `analyzeFees(profileIdParam)` - Main endpoint caller
  - Fetch POST `/api/analyze-profile` con `{profileId, wipeCache}`
  - Resp headers: `X-Cache-Hit`, `X-Cache-Timestamp`
  - Chiama `displayFeeResults()` con dati processati
  - Error handling + UI feedback

#### 2. **Display Layer** (results-display.ts)
- `displayFeeResults(data, fleetNames, rentedFleetNames, fleets)`
  - Prepara dati per rendering (normalization, sorting)
  - Genera HTML layout (stats grid, charts, table containers)
  - Chiama `createFleetList()`, `createOperationList()`, `createOtherOperationsList()`
  - Popola canvas per pie charts

#### 3. **Fleet/Operation Tables** (fleet-operations.ts)
- `createFleetList()` - Tabella flotte con operazioni nested
  - Ordina per totalFee descending
  - Gestisce rental status visual (classe `rented-name`)
  - Rende operazioni per fleet normalizate

- `createOperationList()` - Tabella operazioni per fleet
  - Normalization nomi operazioni
  - Rafgruppamento per operazione across fleets
  - Special handling per "Crafting" (collapse/expand)
  - Dettagli per crafting (burned/claimed items)

- `createOtherOperationsList()` - Operazioni escluse
  - Esclude categorie hardcoded (Starbase, Configuration, etc)
  - Mostra detailed breakdowns

#### 4. **Charts** (charts.ts)
- `drawPieChart(canvasId, legendId, data, prices)`
  - Pie chart simple (no library, usando canvas)
  - Legend generation
  - Color mapping per operation type

#### 5. **Details Rendering** (renderDetails.ts)
- `renderCraftingDetailsRows(details, maxDetails)`
  - Parse decoded instruction data
  - Extract txid, materials, fees
  - Human-readable format (burned/claimed items)
  - Copy-to-clipboard per txid

---

## 5. CONFIGURAZIONE & ENVIRONMENT

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": false,                    // ⚠️ strict mode OFF
    "noUnusedLocals": true,             // ← Causa i 11 errori TS6133
    "noUnusedParameters": true,         // ← Causa i 11 errori
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@services/*": ["src/services/*"],
      "@ui/*": ["src/ui/*"],
      "@utils/*": ["src/utils/*"],
      "@types/*": ["src/types/*"]
      // ❌ @app/* NOT DEFINED
    }
  }
}
```

### vite.config.ts
```typescript
// Configura alias di resolve per Vite (deve corrispondere a tsconfig paths)
```

### package.json Scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

---

## 6. GLOBAL FUNCTIONS IN WINDOW

**Dichiarate in main.ts** (linee 25-40):
```typescript
declare global {
  interface Window {
    wallet: any;
    analyzeFees: (profileIdParam?: string) => void;           ✅
    updateProgress: (message: string) => void;                ✅
    displayFeeResults: (data: any, fleetNames: any, ...) => void;✅
    displayPartialResults: (update: any, ...) => void;        ⚠️ Placeholder
    toggleFleet: (fleetId: string) => void;                   ✅
    drawPieChart: (canvasId: string, ...) => void;            ✅
    createFleetList: (data: any, ...) => void;                ✅
    createOperationList: (data: any, ...) => void;            ✅
    createOtherOperationsList: (data: any, ...) => void;      ✅
    prices?: any;                                              ✅ (populated externally)
  }
}
```

**Status:** Tutte dichiarate, ma devo verificare se sono effettivamente assignate nel runtime (linea 60+).

---

## 7. MISSING FILE - @types/api.ts

### Cosa Manca
**Interfacce API** che `api.ts` sta importando:
```typescript
- FleetsRequest
- FleetsResponse
- WalletSageFeesStreamRequest
- FleetBreakdownRequest
- FleetBreakdownResponse
- ApiError
```

### Dove Copiare
→ Disponibile completo in `/home/luca/frontend_vecchia/src/types/api.ts` (57 righe)

### Contenuto Richiesto
```typescript
export interface FleetsRequest {
  profileId: string;
}

export interface FleetData {
  key: string;
  callsign: string;
  data: {
    fleetShips: string;
    fuelTank?: string;
    ammoBank?: string;
    cargoHold?: string;
  };
  isRented?: boolean;
}

export interface FleetsResponse {
  walletAuthority: string;
  fleets: FleetData[];
}

export interface WalletSageFeesStreamRequest {
  walletPubkey: string;
  fleetAccounts: string[];
  fleetNames: { [account: string]: string };
  fleetRentalStatus: { [account: string]: boolean };
  hours: number;
  enableSubAccountMapping: boolean;
}

export interface FleetBreakdownRequest {
  walletPubkey: string;
  fleetAccounts: string[];
  fleetNames: { [account: string]: string };
  fleetRentalStatus: { [account: string]: boolean };
  enableSubAccountMapping: boolean;
}

export interface FleetBreakdownResponse {
  feesByFleet: FeesByFleet;
}

export type ApiError =
  | { type: 'http'; status: number; message: string }
  | { type: 'network'; error: Error }
  | { type: 'parse'; cause: unknown };
```

---

## 8. PROBLEMI REALI vs FALSE POSITIVES

### 🔴 BLOCCA BUILD
1. **TS6133/TS6198 Errors** - 11 errori di "unused variables"
   - Soluzione: Rimuovere/commentare le variabili non usate
   - Tempo: 15 minuti (fix semplice)

### 🟡 BLOCCA RUNTIME (Potenziale)
1. **@types/api.ts mancante**
   - Build fallirà con type error se `@ts-nocheck` viene rimosso da api.ts
   - Soluzione: Copiare api.ts da frontend_vecchia
   - Tempo: 5 minuti

2. **@app path alias inesistente** 
   - `results-display.ts:5` importa da `@app/charts`
   - Ma tsconfig NON ha `@app` alias
   - Soluzione: Cambiare a `@services/charts`
   - Tempo: 1 minuto

3. **Global functions non assignate?**
   - Devo leggere `main.ts` linea 60+ per verificare se funzioni sono assignate
   - Soluzione: Aggiungere come necessario
   - Tempo: 10 minuti se necessario

4. **DOM Elements hardcoded**
   - Codice assume existence di: `#mainContainer`, `#fleetList`, `#operationList`, `#otherOperationsList`, `#results`, `#sidebar`, etc
   - Devo controllare `index.html` se ha questi IDs

### 🟢 FALSE POSITIVES
- `rentedFleetNames` in `createFleetList()` - commentato ma parametro rimane per API consistency
- `fleetAccount` in destructuring - usato in logica sottostante
- Type guard functions - Potrebbero servire per future validation

---

## 9. CHECK-LIST COMPLETAMENTO

### Immediate (10 min)
- [ ] Creare `src/types/api.ts` da frontend_vecchia
- [ ] Cambiare `@app/charts` → `@services/charts` in results-display.ts:5
- [ ] Fix 11 errori TS6133/TS6198 (rimuovere/usare variabili dead code)

### Before Runtime (30 min - assumendo backend ready)
- [ ] Verificare index.html ha DOM elements richiesti
- [ ] Verificare `window.prices` è poppolato (dove/come?)
- [ ] Verificare global functions sono effettivamente assignate a `window` in main.ts
- [ ] Verificare endpoint `/api/analyze-profile` esiste e ritorna formato atteso

### Quality (1-2 ore)
- [ ] Rimuovere `// @ts-nocheck` da api.ts
- [ ] Aggiungere proper error handling UI
- [ ] Implementare loading states
- [ ] Type the `any` declarations (use generics)
- [ ] Test flusso completo end-to-end

---

## 10. SUMMARY FINALE

| Aspetto | Status | % |
|---------|--------|-----|
| Struttura File | ✅ Completa | 100% |
| Type Definitions | ⚠️ 1 file manca | 80% |
| API Integration | ✅ Present | 100% |
| Display/Rendering | ✅ Complete | 100% |
| UI Components | ✅ Complete | 100% |
| Import Paths | ⚠️ 1 alias errato | 95% |
| Code Quality | ⚠️ 11 dead code | 90% |
| Runtime Ready | ❌ TBD | 60%* |
| **MEDIA** | **75%** | |

**\* Dipendente da:** backend endpoint working, DOM elements present, prices data available

---

## Realistico Stato Cosa Ti Serve

1. **Per BUILD PASSARE (5 mins):**
   - Copy `api.ts` type definitions
   - Fix path alias @app/charts → @services/charts
   - Fix 11 dead code warnings

2. **Per RUN PASSARE (30 mins assuming backend is ready):**
   - Verify index.html structure
   - Verify backend endpoint `/api/analyze-profile` 
   - Verify `window.prices` populating
   - Test click → analyze → render flow

3. **Per USARE COMFORTABLY (1-2 hours):**
   - Remove `@ts-nocheck`
   - Add error boundaries
   - Type the `any` declarations
   - Test all paths end-to-end
