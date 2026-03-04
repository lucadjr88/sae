# Analisi Dettagliata dei 11 Errori TS6133/TS6198

**Data:** 2 Marzo 2026  
**Analisi:** Verificare se variabili sono davvero "dead code" o usate altrove

---

## RISULTATI ANALISI

### ✅ FALSI POSITIVI (Variabili EFFETTIVAMENTE USATE)

#### 1. **fleetAccount** (linea 39)
**Codice:**
```typescript
// Linea 39-45: forEach di debug
sortedFleets.forEach(([fleetAccount, fleetData]) => {
  const ops = Object.keys(fleetData.operations || {});
  if (ops.length > 0) {
    //console.log(`[createFleetList] Fleet ${fleetNames[fleetAccount] || fleetAccount} ops:`, ops);
  }
});

// Linea 48-185: forEach principale
sortedFleets.forEach(([fleetAccount, fleetData]) => {
  const fleetName = fleetNames[fleetAccount] || fleetAccount;  // ← USATO QUI
  const fleetId = 'fleet-' + fleetAccount.substring(0, 8);  // ← USATO QUI
  ...
  const isCraftingCategory = fleetAccount === 'Crafting Operations';  // ← USATO QUI
  ...
  const existingFleetEntry = operationFleetMap[normName].find(e => e.fleetAccount === fleetAccount);  // ← USATO QUI
```

**Status:** ✅ **USATO** – Linea 39 è un ciclo di DEBUG commentato, ma `fleetAccount` è compiuitamente usato nel ciclo principale a linea 48. 

**Azione:** NON RIMUOVERE - Falso positivo del linter (scoping issue nel destructuring).

---

#### 2. **nameClass linea 56** (createFleetList)
**Codice:**
```typescript
// Linea 56: Dichiarazione
const nameClass = fleetData.isRented ? 'fleet-name rented-name' : 'fleet-name';
const nameInner = fleetData.isRented
  ? `<span class="rented-name" style="color:#fbbf24;font-weight:800">${fleetName}</span>`
  : `${fleetName}`;

// Linea 72: Uso nel template
html += `  
  <div class="fleet-header" ...>
    <div class="${nameClass}" style="flex: 1;">${nameInner}</div>  // ← USATO QUI
```

**Status:** ✅ **USATO** – Applicato al div class più sotto nel template HTML.

**Azione:** NON RIMUOVERE - Falso positivo del linter.

---

### ❌ DEAD CODE REALE (Variabili INUTILIZZATE)

#### 3. **rentedFleetNames** (linea 20, parametro di createFleetList)
**Codice:**
```typescript
export function createFleetList(
  data: OperationListData,
  fleetNames: FleetNamesMap,
  rentedFleetNames: Set<string> = new Set()): void {  // ← Parametro mai usato
  
  // Linea 28: Commentato
  //const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));
```

**Contesto:**
- In `createFleetList()` il parametro NON è usato (la linea 28 è commentata)
- In `createOperationList()` linea 201 è usato e creano rentedLc
- In `createOtherOperationsList()` linea 401/406 è usato e creano rentedLc
- In `results-display.ts` viene passato quando chiama queste funzioni

**Status:** ❌ **INUTILIZZATO IN CREATEFLEETLIST** – Function signature chiede il parametro per API consistency, ma non lo usa perché il logic è spostato nel backend (fleetData.isRented viene dal server)

**Azione:** **Commentare la linea 28 è già OK** - la logica è gestita dal server. Se vuoi essere strict:
```typescript
// Option 1: Prefisso underscore per dire "intenzionalmente non usato"
export function createFleetList(
  data: OperationListData,
  fleetNames: FleetNamesMap,
  _rentedFleetNames: Set<string> = new Set()): void {  // ← Underscore
```

---

#### 4. **stats in .map() (linea 255)**
**Codice:**
```typescript
// Linea 255: .map di debug
console.log('[createOperationList] Operazioni disponibili:', sortedOperations.map(([op, stats]) => op));  // ← stats non usato

// Linea 256: forEach di debug
sortedOperations.forEach(([op, stats]) => {  // ← Entire destructure [op, stats] non usato
  //console.log(`[createOperationList] Op: ${op}, count: ${stats.count}, totalFee: ${stats.totalFee}`);
});
```

**Status:** ❌ **DEAD CODE DI DEBUG** – Console.log e forEach completamente commentati. Non hanno effetto.

**Azione:** **RIMUOVERE entrambe le linee 255-257**

---

#### 5. **excludedCategories** (linea 409)
**Codice:**
```typescript
// Linea 409-423: Array dichiarato ma mai usato
const excludedCategories = [
  'Starbase Operations',
  'Configuration',
  'Cargo Management',
  // ... 10+ categorie
];

// Non ci sono controlli che usano excludedCategories
// La logica è: "Get operations from excluded fleets that are NOT in the included operations set"
// ma non filtra per excludedCategories
```

**Status:** ❌ **DEAD CODE LEGACY** – Rimasto da versione vecchia, logica completamente cambiata.

**Azione:** **RIMUOVERE linee 409-423**

---

#### 6. **opStats in .filter()** (linea 475)
**Codice:**
```typescript
// Linea 475: filter di otherOperations
const otherOperations = Object.entries(normalizedFeesByOperation)
  .filter(([operation, opStats]) => !includedOperations.has(operation))  // ← opStats non usato
  .sort((a, b) => b[1].totalFee - a[1].totalFee);
```

**Contesto:** Predicato filtra solo su `operation`, non su `opStats`.

**Status:** ❌ **DEAD VARIABLE** – `opStats` viene destructurato ma non usato nel predicato.

**Azione:** **CAMBIARE:**
```typescript
.filter(([operation]) => !includedOperations.has(operation))
```

---

#### 7. **nameClass linea 528** (createOtherOperationsList)
**Codice:**
```typescript
// Linea 528-532
if (!isCrafting) {
  fleets.forEach(fleet => {
    const nameClass = fleet.isRented ? 'rented-name' : '';  // ← Dichiarato
    const nameStyle = fleet.isRented ? 'color:#fbbf24;font-weight:800' : '';
    const fleetNameHtml = fleet.isRented
      ? `<span style="${nameStyle}">${fleet.fleetName}</span>`  // ← NON USA nameClass!
      : fleet.fleetName;
    
    // Linea 533: Non usa nameClass
    html += `
      <tr>
        <td>${fleetNameHtml}</td>  // ← Non referenzia nameClass
```

**Status:** ❌ **DEAD VARIABLE** – Dichiarato ma non usato nel template. Lo `style` viene usato, non il `class`.

**Azione:** **RIMUOVERE linea 528**
```typescript
const nameStyle = fleet.isRented ? 'color:#fbbf24;font-weight:800' : '';
const fleetNameHtml = fleet.isRented  // ← Reste questa
  ? `<span style="${nameStyle}">${fleet.fleetName}</span>`
  : fleet.fleetName;
```

---

#### 8. **decodedCached** (renderDetails.ts, linea 20)
**Codice:**
```typescript
// Linea 20: Dichiarazione
let decodedCached: any = null;

// Linee 32, 37, 41, 51, 62: Assegnamenti
decodedCached = { recipeName: recipe, craftingFacility: craftFac };
decodedCached = { recipeName: dd.recipeName || cat };
decodedCached = { itemMint: mint };
decodedCached = dd;
decodedCached = dd;

// NO USO SUCCESSIVO - Non è mai letto o passato a nessuno
```

**Status:** ⚠️ **RESERVED FOR FUTURE** – Nome suggerisce caching per analytics/logging futuro. Non causa problemi di performance perché viene overwritten ogni iterazione.

**Azione:** **Lasciare com'è** CON UN COMMENTO:
```typescript
let decodedCached: any = null;  // Reserved for future analytics/logging
```

Oppure se vuoi essere strict, rimuovere tutti gli assegnamenti.

---

#### 9. **burns parameter** (utils.ts linea 26)
**Codice:**
```typescript
export function inferRecipeName(decoded: DecodedInstruction | null, burns: BurnedMaterial[], claims: ClaimedItem[]): string | null {
  // Linea 26 - NO USO di burns all'interno della funzione
  // Solo usa decoded e claims
  
  try {
    const c = claims && claims.length > 0 ? claims[0] : null;
    // ... usa solo claims
  }
  
  // Commento interno dice: "Prefer claimed items (produced outputs)"
  // Non serve usare burned materials
}
```

**Uso da chi chiama:**
```typescript
// renderDetails.ts:45, 56
const burns = (dd && (dd.burnedMaterials || ...)) || [];
const prod = inferRecipeName(dd, burns, claims);  // ← burns viene passato
```

**Status:** ❌ **PARAMETRO INUTILIZZATO** – La funzione prende `burns` ma non lo usa. 

**Azione:** **FIX:**
```typescript
// Option 1: Prefisso underscore (TypeScript idiom per "intenzionalmente non usato")
export function inferRecipeName(decoded: DecodedInstruction | null, _burns: BurnedMaterial[], claims: ClaimedItem[]): string | null {

// Option 2: Rimuovere completamente (breaking change)
export function inferRecipeName(decoded: DecodedInstruction | null, claims: ClaimedItem[]): string | null {
  // Poi aggiornare launchsite che lo chiama
```

**Raccomandazione:** Usare **Option 1 (underscore)** per mantenere API consistency.

---

#### 10-11. **isDecodedInstruction, isValidMaterialEntry** (utils.ts, linee 121, 125)
**Codice:**
```typescript
// Linea 121: Type guard function
function isDecodedInstruction(obj: any): obj is DecodedInstruction {
  return obj && typeof obj === 'object' && ('recipeName' in obj || 'actions' in obj);
}

// Linea 125: Type guard function  
function isValidMaterialEntry(obj: any): obj is MaterialEntry {
  return obj && typeof obj === 'object' && ('material' in obj || 'recipe' in obj || 'decodedMaterial' in obj);
}

// NESSUNO USA QUESTE FUNZIONI nel codebase
```

**Status:** ⚠️ **INFRASTRUCTURE CODE** – Type guards preparati per validazione futura. Common pattern in TypeScript per futura estensibilità.

**Azione:** **Lasciare con commento:**
```typescript
// Type guard functions - reserved for future input validation layer
function isDecodedInstruction(obj: any): obj is DecodedInstruction {

function isValidMaterialEntry(obj: any): obj is MaterialEntry {
```

O commentarli completamente se vuoi build completamente clean.

---

## SUMMARY AZIONI

| # | Variabile | File | Tipo | Azione | Urgenza |
|---|-----------|------|------|--------|---------|
| 1 | fleetAccount:39 | fleet-ops | Falso positivo | Lasciare | 🟢 No |
| 2 | nameClass:56 | fleet-ops | Falso positivo | Lasciare | 🟢 No |
| 3 | rentedFleetNames:20 | fleet-ops | Parametro non usato | Prefisso `_` | 🟡 Suggerito |
| 4 | stats:255 | fleet-ops | Debug code | Rimuovere linee 255-257 | 🔴 Sì |
| 5 | excludedCategories:409 | fleet-ops | Legacy dead code | Rimuovere linee 409-423 | 🔴 Sì |
| 6 | opStats:475 | fleet-ops | Destructure non usato | Fix `.filter([operation])` | 🔴 Sì |
| 7 | nameClass:528 | fleet-ops | Variable non usato | Rimuovere linea 528 | 🔴 Sì |
| 8 | decodedCached:20 | renderDetails | Reserved future | Aggiungere commento | 🟡 Suggerito |
| 9 | burns:26 | utils | Parameter non usato | Prefisso `_burns` | 🔴 Sì |
| 10 | isDecodedInstruction | utils | Infrastructure | Aggiungere commento | 🟡 Suggerito |
| 11 | isValidMaterialEntry | utils | Infrastructure | Aggiungere commento | 🟡 Suggerito |

---

## FIX PRIORITIZZATI

### Tier 1 - RIMUOVERE (5 min)
1. ✂️ Linee 255-257 (stats debug)
2. ✂️ Linee 409-423 (excludedCategories)
3. ✂️ Linea 528 (nameClass)

### Tier 2 - FIX (3 min)
1. 🔧 Linea 475: `.filter([operation])` 
2. 🔧 Linea 26: `_burns` parameterco

### Tier 3 - COMMENTI (2 min)
1. 💬 Linea 20 renderDetails: `// Reserved for future analytics`
2. 💬 Linea 121-125: `// Type guards for future validation`

### Tier 4 - OPTIONAL (Falsi positivi, lasciare)
1. Linee 39, 56: Non rimuovere (codice usato)
