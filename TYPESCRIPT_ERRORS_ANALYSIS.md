# TypeScript Errors Analysis - Confronto nuovo vs vecchio frontend

## Panoramica
Il nuovo frontend (`/home/luca/sae/frontend/`) presenta 11 errori TS6133/TS6198 (variabili dichiarate ma non usate). Il confronto con `frontend_vecchia/` rivela pattern di **refactoring incompiuto** e **code cleanup parziale**.

---

## Errori Dettagliati

### 1. **Import inutilizzato: CraftingDetail** (Linea 4)
**Stato:**
- **Nuovo** (sae/frontend): `//import type { CraftingDetail } from '../types/details';` (commentato)
- **Vecchio** (frontend_vecchia): `import type { CraftingDetail, Prices } from '../types/details';` (importato ma non usato)

**Analisi:**
Il tipo `CraftingDetail` non è mai referenziato nel codice di nessuna delle due versioni. L'import nel vecchio era una dichiarazione di intenzione non completata. Nel nuovo è già correttamente commentato.

**Azione:**
✅ Già appropriatamente commentato. Nessun intervento necessario.

---

### 2. **Variabile inutilizzata: rentedLc** (Linea 28)
**Stato:**
- **Nuovo** (sae/frontend): `//const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));` (commentato nella funzione `createFleetList`)
- **Vecchio** (frontend_vecchia):
  - Linea 28 in `createFleetList`: Commentato
  - Linea 28 in `createOtherOperationsList`: **Attivamente usato** (per verificare `rentedLc.has(...)`)

**Analisi:**
`rentedLc` è una mappa case-insensitive dei nomi flotte noleggiate. Nel **nuovo frontend**:
- È commentato in `createFleetList` (corretto, perché non usato).
- **MANCA completamente in `createOtherOperationsList`**, dove è necessario per il check su linea 432: `const isRented = !!(fleetData.isRented || rentedLc.has(...))`

Questo è un **bug**: il nuovo frontend non può più rilevare le flotte noleggiate nella funzione `createOtherOperationsList`.

**Azione:**
❌ Necessario recuperare `rentedLc` in `createOtherOperationsList`. Attualmente il check cade sempre sulla clausola `fleetData.isRented` senza il fallback case-insensitive.

---

### 3. **Parametro fleetAccount non usato** (Linea 39)
**Stato:**
```typescript
// Nuovo e Vecchio
sortedFleets.forEach(([fleetAccount, fleetData]) => {
```

**Analisi:**
`fleetAccount` VIENE usato:
- `const fleetName = fleetNames[fleetAccount] || fleetAccount;` (linea 48)
- `const fleetId = 'fleet-' + fleetAccount.substring(0, 8);` (linea 49)
- Il ciclo di operazioni usa `${fleetAccount}` nella mappa (linelli 85-90)

**Conclusion:**
⚠️ **Falso positivo del linter**. La variabile è effettivamente usata. Potrebbe essere un problema con il destructuring pattern riconosciuto dal type checker.

**Azione:**
Se il linter persiste, usare: `const [fleetAccount] = [key, value];` oppure `const entry: [string, FleetFeeData] = [key, value];`

---

### 4. **Parametro destructurato stats non usato** (Linea 255-256)
**Stato:**
```typescript
// Linea 255 (nel .map):
console.log('[createOperationList] Operazioni disponibili:', sortedOperations.map(([op, stats]) => op));

// Linea 256 (nel forEach):
sortedOperations.forEach(([op, stats]) => {
  // stats non viene usato
});
```

**Analisi:**
Nel `.map()` di debug, `stats` non è referenziato (viene loggato solo `op`).
Nel `.forEach()` successivo, `stats` non è usato per niente.

**Pattern:**
- **Nuovo**: Identico al vecchio
- **Vecchio**: Stesso problema

**Azione:**
✅ Cambiare il destructuring per non importare `stats`:
```typescript
// Linea 255
console.log('[createOperationList] Operazioni disponibili:', sortedOperations.map(([op]) => op));

// Linea 256
sortedOperations.forEach(([op]) => {
```

---

### 5. **Variabile excludedCategories non usata** (Linea 409)
**Stato:**
- **Nuovo** (sae/frontend): Dichiarata ma commentato il codice che la usa
- **Vecchio** (frontend_vecchia): Dichiarata ma **mai usata nel codice**

**Analisi:**
`excludedCategories` viene costruito come array statico ma **non è mai referenziato**. Sembra rimasuglio di refactoring dove la logica di esclusione è stata spostata.

**Pattern:**
Era usato in una versione ancora più vecchia per filtrare le operazioni, ma poi la logica è cambiata e `excludedCategories` è rimasto come commento.

**Azione:**
❌ Rimuovere completamente la dichiarazione inutilizzata (linee 409-423).

---

### 6. **Parametro opStats non usato nel destructuring** (Linea 475)
**Stato:**
```typescript
.filter(([operation, opStats]) => !includedOperations.has(operation))
```

**Analisi:**
Nel filter di `otherOperations`, il secondo elemento `opStats` non è mai usato nel predicato (che controlla solo `operation`). Questo è un **TS6198** (tutti gli elementi destructurati non usati nel contesto di filter).

**Pattern:**
- **Nuovo**: Identico al vecchio
- **Vecchio**: Stesso pattern

**Azione:**
✅ Cambiare:
```typescript
.filter(([operation]) => !includedOperations.has(operation))
```

---

### 7. **Variabile nameClass non usata** (Linea 528)
**Stato:**
```typescript
// Nuovo (linea 528):
const nameClass = fleet.isRented ? 'rented-name' : '';

// Vecchio (linea 74):
const nameClass = fleet.isRented ? 'rented-name' : '';
const nameStyle = fleet.isRented ? 'color:#fbbf24;font-weight:800' : '';
const fleetNameHtml = fleet.isRented ? ...
```

**Analisi:**
Nel **nuovo frontend**, `nameClass` è dichiarata ma mai usata (il codice HTML non include più il `class="${nameClass}"`).

Nel **vecchio frontend**, `nameClass` viene costruito ma **mai usato nel template HTML** (è stata sostituita da `nameStyle` inline).

**Pattern:**
Refactoring incompleto: è rimasta la dichiarazione vecchia, non più sincronizzata con il template HTML.

**Azione:**
❌ Rimuovere linea 528 completamente (è una dead declaration).

---

### 8. **Variabile decodedCached non usata** (renderDetails.ts:20)
**Stato:**
- **Nuovo** e **Vecchio**: Identici

```typescript
let decodedCached: any = null;
// ... assegnamenti (linee 37, 42, 47, 56, 62)
// ... Ma mai usato nella riga di HTML finale (linea 65-70)
```

**Analisi:**
`decodedCached` viene assegnato in 5 branche del codice ma **non è mai referenziato dopo**. Sembra una preparazione per una feature futura (es: passare il dato decodificato ad una funzione di rendering avanzata, o logging).

**Pattern:**
- Presente in entrambe le versioni
- Potrebbe essere infrastructure per Analytics/Debugging futuro

**Azione:**
⚠️ **Conservare per ora** (potrebbe servire per debug). Aggiungere commento: `// Reserved for future analytics`

---

### 9. **Parametro burns non usato** (utils.ts:26)
**Stato:**
```typescript
export function inferRecipeName(decoded: DecodedInstruction | null, burns: BurnedMaterial[], claims: ClaimedItem[]): string | null {
  // burns non è mai usato
  // Claims viene usato (linee 29-31)
}
```

**Analisi:**
La funzione accetta `burns` come parametro, ma:
1. **Non lo usa mai nel body**
2. Usa solo `claims` (claimed items = output della ricetta, non input)
3. Il commento in testa dice "Prefer claimed items (produced outputs)" - quindi il parametro `burns` è semanticamente sbagliato

**Pattern:**
Firme legacy da versioni precedenti. Il refactoring ha rimosso il codice che usava `burns`, ma non ha aggiornato la firma.

**Azione:**
❌ Rimuovere il parametro `burns` dalla firma di `inferRecipeName()` e da tutte le 7 chiamate:
- [renderDetails.ts:48](renderDetails.ts#L48)
- [renderDetails.ts:54](renderDetails.ts#L54)
- [fleet-operations.ts:95](fleet-operations.ts#L95)
- E altre...

---

### 10-11. **Type guard functions inutilizzate** (utils.ts:121, 125)
**Stato:**
```typescript
function isDecodedInstruction(obj: any): obj is DecodedInstruction { ... }
function isValidMaterialEntry(obj: any): obj is MaterialEntry { ... }
```

**Analisi:**
Queste funzioni di type narrowing sono dichiarate ma **mai usate nel codice**. Sembra siano state preparate per validazione futura che non è stata implementata.

**Pattern:**
- **Nuovo**: Identico al vecchio
- **Vecchio**: Stesso problema

**Azione:**
⚠️ **Considerare conservare**: Sono funzioni di type safety che potrebbero servire per validazione futura. Se definitivamente non usate, commentarle con: `// @deprecated - Type guards prepared for future validation`

---

## Riepilogo Azioni Necessarie

| Linea | File | Problema | Azione | Priorità |
|-------|------|----------|--------|----------|
| 4 | fleet-operations.ts | CraftingDetail import | ✅ Già ok (commentato) | - |
| 28 | fleet-operations.ts | rentedLc mancante in createOtherOperationsList | Aggiungere dichiarazione | 🔴 ALTA |
| 39 | fleet-operations.ts | fleetAccount falso positivo | Refactor destructuring se linter persiste | 🟡 MEDIA |
| 255-256 | fleet-operations.ts | stats nel destructuring | Rimuovere da .map() e forEach() | 🟢 BASSA |
| 409 | fleet-operations.ts | excludedCategories non usato | Rimuovere dichiarazione | 🟢 BASSA |
| 475 | fleet-operations.ts | opStats inutilizzato | Rimuovere da destructuring | 🟢 BASSA |
| 528 | fleet-operations.ts | nameClass non usato | Rimuovere dichiarazione | 🟢 BASSA |
| 20 | renderDetails.ts | decodedCached | Aggiungere commento o implementare uso | 🟡 MEDIA |
| 26 | utils.ts | burns parametro | Rimuovere firma e chiamate | 🔴 ALTA |
| 121 | utils.ts | isDecodedInstruction | Commentare deprecato | 🟡 MEDIA |
| 125 | utils.ts | isValidMaterialEntry | Commentare deprecato | 🟡 MEDIA |

---

## Differenze Chiave: Nuovo vs Vecchio

| Aspetto | Nuovo (sae/frontend) | Vecchio (frontend_vecchia) |
|--------|--------|--------|
| **Import CraftingDetail** | Commentato | Importato, non usato |
| **rentedLc in createFleetList** | Commentato | Commentato |
| **rentedLc in createOtherOperationsList** | **MANCANTE** (BUG) | Presente e usato |
| **nameClass** | Dichiarato, non usato | Dichiarato, non usato |
| **decodedCached** | Non usato | Non usato |
| **Type guards in utils** | Presenti, non usati | Presenti, non usati |

**Conclusione:** Il nuovo frontend è una pulizia parziale del vecchio, con alcuni bug introdotti per negligence (mancanza di `rentedLc`). La maggior parte degli errori esiste in entrambe le versioni - sono dead code da cleanup.
