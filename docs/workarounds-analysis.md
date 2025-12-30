# Workaround e Patch nel Progetto SAE

Questo documento elenca i workaround e le patch hardcoded trovati nel progetto, che rappresentano soluzioni temporanee o specifiche per gestire casi particolari nel codice.

## 1. Liste Hardcoded di Categorie da Escludere (Frontend)

**File:** `public/js/app/fleet.js`, `public/js/fleet-operations.js`

**Descrizione:** Liste hardcoded di categorie che vengono escluse dal "fleet breakdown" per evitare di mostrare operazioni aggregate come fleet reali.

```javascript
const categories = [
  'Starbase Operations',
  'Configuration',
  'Cargo Management',
  'Crew Management',
  'Survey & Discovery',
  'Player Profile',
  'Fleet Rentals',
  'Universe Management',
  'Game Management',
  'Other Operations'
];
```

**Problema:** Queste categorie sono hardcoded e potrebbero non coprire tutti i casi futuri. Rappresentano un filtro arbitrario per nascondere operazioni non associate a fleet specifiche.

## 2. Liste Hardcoded di Account da Escludere (Backend)

**File:** `src/examples/wallet-sage-fees-detailed.ts`, `src/examples/wallet-sage-fees-streaming.ts`, `src/examples/streaming-fees-modules/streaming-fees-setup.ts`

**Descrizione:** Liste di account pubblici generici (come SAGE Program, System Program, Token Program) che vengono esclusi dal processamento per evitare falsi positivi nell'associazione fleet.

```javascript
const excludeAccounts = [
  'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE', // SAGE Program
  'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr', // Game Program  
  '11111111111111111111111111111111', // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
];
```

**Problema:** Lista hardcoded che richiede aggiornamenti manuali se vengono aggiunti nuovi programmi o account generici.

## 3. Mappa delle Operazioni (OP_MAP)

**File:** `src/examples/op-map.ts`

**Descrizione:** Mappa hardcoded che associa nomi di istruzioni SAGE a descrizioni leggibili delle operazioni.

```javascript
const OP_MAP: { [key: string]: string } = {
  'fleetStateHandler': 'FleetStateHandler',
  'startMining': 'StartMining',
  // ... molte altre associazioni
};
```

**Problema:** Richiede aggiornamenti manuali quando vengono aggiunte nuove istruzioni al programma SAGE. Non è auto-generato dall'IDL.

## 4. Rilevamento Pattern-Based per Operazioni

**File:** `src/examples/wallet-sage-fees-detailed.ts`, `src/examples/wallet-sage-fees-streaming.ts`, `services/walletSageFeesStreaming/lib/parsers.ts`

**Descrizione:** Logica complessa con regex e pattern matching per identificare operazioni dai log quando OP_MAP fallisce.

```javascript
if (combinedLower.includes('craft')) {
  operation = 'Crafting';
} else if (combinedLower.includes('mine') || combinedLower.includes('mining')) {
  // ...
}
```

**Problema:** Fragile e soggetto a errori se i log cambiano formato. Molteplici fallback hardcoded per casi speciali.

## 5. Raggruppamento Operazioni Hardcoded

**File:** `src/examples/wallet-sage-fees-detailed.ts`, `src/examples/wallet-sage-fees-streaming.ts`

**Descrizione:** Logica per raggruppare operazioni simili in categorie più ampie.

```javascript
if (operation === 'StartSubwarp' || operation === 'StopSubwarp' || operation === 'EndSubwarp' || operation === 'Subwarp') {
  groupedOperation = 'Subwarp';
} else if (operation === 'CraftStart' || operation === 'CraftClaim' || operation === 'Crafting') {
  groupedOperation = 'Crafting';
}
```

**Problema:** Liste hardcoded di operazioni da raggruppare, che richiedono manutenzione manuale.

## 6. Gestione Speciale per FleetStateHandler

**File:** `src/examples/wallet-sage-fees-detailed.ts`, `src/examples/wallet-sage-fees-streaming.ts`, `services/walletSageFeesStreaming/lib/parsers.ts`

**Descrizione:** Logica speciale per reinterpretare "FleetStateHandler" in base ai log (es. come completamento Subwarp o Mining).

```javascript
if (operation === 'FleetStateHandler') {
  const logsJoined = (tx.logMessages || []).join(' ');
  if (logsJoined.includes('MoveSubwarp')) {
    operation = 'StopSubwarp';
  } else if (logsJoined.includes('MineAsteroid')) {
    operation = 'StopMining';
  }
}
```

**Problema:** Workaround perché FleetStateHandler è un'istruzione generica che può rappresentare diversi stati. Richiede parsing manuale dei log.

## 7. Condizioni Speciali per Subwarp

**File:** `src/examples/wallet-sage-fees-detailed.ts`, `src/examples/streaming-fees-modules/fee-aggregator.ts`

**Descrizione:** Controlli aggiuntivi per confermare che un'operazione sia realmente Subwarp leggendo i log.

```javascript
if (logsLower.includes('subwarp') || instrLower.includes('subwarp')) {
  // conta come Subwarp
}
```

**Problema:** Duplicazione di logica per validare operazioni, necessaria perché l'identificazione iniziale può essere inaccurata.

## 8. Esclusione Crafting dalle Fleet Individuali (Recentemente Aggiunto)

**File:** `src/examples/wallet-sage-fees-detailed.ts`

**Descrizione:** Condizione aggiunta per non assegnare operazioni di crafting alle fleet individuali, tenendole solo in categorie aggregate.

```javascript
} else if (!finalOperation.includes('Craft')) {
  // aggiungi a fleetEntry.operations
}
```

**Problema:** Workaround specifico per risolvere un problema di UI, ma rappresenta una logica di business hardcoded.

## 9. Fallback per Materiali di Crafting

**File:** `src/examples/wallet-sage-fees-detailed.ts`

**Descrizione:** Default a "Craft Food" se non si riesce a determinare il materiale.

```javascript
let finalOperationForStats = (craftingMaterial === 'Fuel') ? 'Craft Fuel' : 'Craft Food';
```

**Problema:** Assunzione arbitraria che se non è Fuel, sia Food.

## 10. Filtraggio Account per Lunghezza

**File:** Multipli file nel backend

**Descrizione:** Filtro per account con lunghezza > 40 per escludere account non validi.

```javascript
account && !excludeAccounts.includes(account) && account.length > 40
```

**Problema:** Magico numero 40, potrebbe non essere corretto per tutti i casi.

## Raccomandazioni

1. **Centralizzare le configurazioni:** Spostare liste hardcoded in file di configurazione o database.
2. **Usare l'IDL per generare mapping:** Auto-generare OP_MAP dall'IDL di SAGE invece di mantenerlo manualmente.
3. **Migliorare il parsing:** Implementare un parser più robusto che non richieda molteplici fallback.
4. **Aggiungere test:** Per ogni workaround, aggiungere test per verificare che funzioni correttamente.
5. **Documentare le assunzioni:** Commentare chiaramente perché esistono questi workaround e quando possono essere rimossi.

## Nota

Alcuni di questi workaround sono necessari a causa delle limitazioni dell'API di Solana e del formato dei log delle transazioni. Tuttavia, molti potrebbero essere semplificati con un migliore design architetturale o aggiornamenti al programma SAGE.