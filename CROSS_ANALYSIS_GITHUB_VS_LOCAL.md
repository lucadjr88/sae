# Analisi Incrociata - GitHub vs Locale

**Confronto:** `origin/main` (591 linee) vs Locale (574 linee)  
**Repo:** https://github.com/lucadjr88/sae.git  
**Conclusione:** I 5 errori **ESISTONO IDENTICI ANCHE IN MAIN REMOTO**

---

## PATTERN IDENTICI IN GITHUB MAIN

### 1️⃣ **rentedLc - LINEA 30ish (GitHub)**

#### Nel main remoto:
```typescript
// createFleetList - linea 30
const rentedLc = new Set(Array.from(rentedFleetNames).map(n => 
  (n || '').toString().toLowerCase()));

// Commento subito dopo:
// Non serve più: la logica di rented è demandata a processAnalysisData
```

#### Nel locale attuale:
```typescript
// Linea 28 - COMMENTATO
//const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));
```

**Differenza:** Nel main è ATTIVO (TS6133 error), nel locale è COMMENTATO (TS6133 lo vede comunque su parametro).

**Stato GitHub:** ❌ ERRORE - main ha lo stesso TS6133 su rentedFleetNames

---

### 2️⃣ **excludedCategories - LINEA 425 (GitHub)**

#### Nel main remoto (linea 425-443):
```typescript
const excludedCategories = [
  'Starbase Operations',
  'Configuration',
  'Cargo Management',
  'Crew Management',
  'Survey & Discovery',
  'Player Profile',
  'Fleet Rentals',
  'Universe Management',
  'Game Management',
  'Other Operations',
  'Crafting',
  'Crafting Operations'
];

// Seguito da commento:
// "Build a map of operation -> list of fleets with that operation"
// NON USA QUESTA VARIABILE
```

#### Nel locale:
```typescript
// Linea 409-423 - IDENTICO
// NON USATO
```

**Stato GitHub:** ❌ ERRORE - main ha lo stesso TS6133

---

### 3️⃣ **Debug Code (stats) - LINEA 275 (GitHub)**

#### Nel main remoto:
```typescript
// try block con debug code
try {
  console.log('[createOperationList] Operazioni disponibili:', 
    sortedOperations.map(([op, stats]) => op));  // ← stats non usato in map
  sortedOperations.forEach(([op, stats]) => {  // ← forEach vuoto/commentato
    //console.log(`[createOperationList] Op: ${op}, count: ${stats.count}...`);
  });
} catch (e) { console.warn('[createOperationList] DEBUG log error', e); }
```

#### Nel locale:
```typescript
// Linea 255-257 - IDENTICO
```

**Stato GitHub:** ❌ ERRORE - main ha lo stesso TS6133 su stats

---

### 4️⃣ **nameClass - LINEA 546 (GitHub)**

#### Nel main remoto:
```typescript
fleets.forEach(fleet => {
  const nameClass = fleet.isRented ? 'rented-name' : '';  // ← Dichiarato
  const nameStyle = fleet.isRented ? 'color:#fbbf24;font-weight:800' : '';
  const fleetNameHtml = fleet.isRented
    ? `<span style="${nameStyle}">${fleet.fleetName}</span>`  // ← USA style, NON nameClass!
    : fleet.fleetName;
  
  html += `<tr><td>${fleetNameHtml}</td>...`;  // ← NON referenzia nameClass
```

#### Nel locale:
```typescript
// Linea 528-532 - IDENTICO
```

**Stato GitHub:** ❌ ERRORE - main ha lo stesso TS6133 su nameClass

---

### 5️⃣ **opStats in filter - LINEA 475ish**

#### Nel main remoto (non visualizzato in sed, ma nel diff):
```typescript
const otherOperations = Object.entries(normalizedFeesByOperation)
  .filter(([operation, opStats]) => !includedOperations.has(operation))
  // ↑ opStats è destructurato ma non usato nel predicato
```

#### Nel locale:
```typescript
// Linea 475 - IDENTICO
```

**Stato GitHub:** ❌ ERRORE - main ha lo stesso TS6133

---

## DIFFERENZA TRA LOCAL vs GITHUB

```
GitHub Main (591 linee)          Local (574 linee)
├─ rentedLc ATTIVO              ├─ rentedLc COMMENTATO
├─ debug code ATTIVO             ├─ debug code ATTIVO
├─ excludedCategories ATTIVO    ├─ excludedCategories ATTIVO
├─ nameClass ATTIVO             ├─ nameClass ATTIVO
└─ opStats ATTIVO                └─ opStats ATTIVO

Principale differenza: Il locale ha LA variabile rentedLc COMMENTATA (17 linee meno),
ma tutti gli altri errori sono IDENTICI.
```

---

## ANALISI DEL PATTERN: PERCHÉ QUESTI ERRORI ESISTONO?

### 🔍 Ipotesi Storica

#### `rentedFleetNames` parametro
La funzione `createFleetList()` era originariamente progettata per usare un set locale di nomi noleggiati per verifica case-insensitive. Poi la logica è stata centralizzata nel backend (processAnalysisData) che ritorna `fleetData.isRented` già calcolato. Il parametro è rimasto per **API backcompatibility** ma non è più usato in createFleetList.

#### `excludedCategories`
Questo array suggerisce che **originariamente c'era una logica di filtraggio per categorie hardcoded**. Il commento dice "List of category names to exclude from Fleet Breakdown". Poi la logica è stata refactorizzata a favore di un setdei `includedOperations` che viene passato come parametro.

#### Debug code (stats, rentedLc)
Codice di debug rimasto per troubleshooting storico. I `console.log` sono commentati ma il destructuring rimane.

#### `nameClass`
Refactoring incomplete: originariamente la classe CSS veniva usata, poi il design è cambiato per usare solo `style=""` inline.

---

## COSA QUESTO SIGNIFICA PER IL TUO FRONTEND

### ✅ BUONE NOTIZIE

1. **Non è un problema TUO** - Questi errori esistono anche nel codebase ufficiale
2. **Non è un bug nel codice** - TS6133 è solo una "linting rule", non un errore semantico
3. **Il codice FUNZIONA** - GitHub main build passa (assumendo)? O avete lo stesso TS6133?

### ❓ DOMANDA CRITICA

**GitHub main passa il build con `npm run build`?**

Se sì → Questo significa che:
- O `tsconfig.json` su GitHub ha `noUnusedLocals: false`
- O il build è configurato diversamente
- O gli errori sono ignorati con flag

Se no → Questo significa che:
- GitHub main ha gli stessi problemi
- Sei in buona compagnia nel refactoring

---

## SOLUZIONI PROPOSTE - 3 SCENARI

### 🟢 SCENARIO 1: "Clean Up Approach" (Consigliato)

Rimuovere definitivamente il dead code, poiché GitHub main probabilmente farà lo stesso in prossimi commits.

**Azioni:**
1. ✂️ Rimuovere debug code (linee 255-257)
2. ✂️ Rimuovere `excludedCategories` (linee 409-423)
3. ✂️ Rimuovere `nameClass` linea 528
4. 🔧 Fix `.filter([operation])` linea 475
5. 🔧 Prefisso `_burns` parametro utils.ts:26

**Effetto:** Build CLEAN, align con best practices TypeScript moderno

**Rischio:** Se GitHub main non lo fa, divergi, ma è miglioramento di qualità

---

### 🟡 SCENARIO 2: "TypeScript Config Approach"

Modificare `tsconfig.json` per disabilitare gli errori che GitHub main probabilmente ha disabilitato.

```json
{
  "compilerOptions": {
    "noUnusedLocals": false,      // ← Disabilita TS6133
    "noUnusedParameters": false,  // ← Disabilita TS6133 anche su parametri
    // ... resto delle opzioni
  }
}
```

**Effetto:** Build PASSA subito, niente fix richiesti

**Rischio:** 
- Perdi protezione del linter per vero dead code futuro
- Diventi come GitHub main (forse non ideale)

---

### 🔴 SCENARIO 3: "Selective Fix + Comment Approach"

Fix solo i veri dead code, lascia il resto commentato per documentazione.

```typescript
// Linea 255-257: Rimuovere
// Linea 409-423: Rimuovere
// Linea 475: Fix a .filter([operation])
// Linea 528: Rimuovere
// Linea 26 utils: Prefisso _burns

// Il resto (rentedFleetNames, decodedCached, type guards)
// Lasciare con commenti che spiegano intenzione
```

---

## MIA RACCOMANDAZIONE

**Fai SCENARIO 1 (Clean Up)** per:

1. **Qualità del codice** - Rimuovere dead code è sempre meglio
2. **Allineamento con moderne best practices TypeScript**
3. **Non influenza la logica** - Nessuna di queste variabili affetta runtime
4. **Pull request quality** - Se fai PR su GitHub, è un miglioramento chiaro
5. **Future-proof** - Quando GitHub main farà cleanup, sei già avanti

### Passi concetti:

```bash
# 1. Fix i 5 errori veri
# 2. Test che funziona: npm run build
# 3. Commit: "chore: cleanup unused variables and debug code"
# 4. Se vuoi, fai PR a GitHub main
```

---

## NOTA: GitHub Build Status

Vorrei verificare se GitHub main passa veramente il build. Se anche lì fallisce con gli stessi TS6133, significa che:
- È un problema NOTO
- Stanno pianificando cleanup
- Tu sei nella posizione perfetta per proporre fix via PR

**Vuoi che proceda con SCENARIO 1 (Clean Up)?**
