# Crafting Workflow Analysis - Star Atlas SAGE

## Executive Summary
Il processo di crafting in Star Atlas SAGE è composto da **due transazioni separate** che possono essere eseguite a distanza di ore l'una dall'altra. Ogni transazione contiene **multiple operazioni atomiche** che devono essere eseguite in sequenza.

## Struttura del Processo di Crafting

### Transazione 1: Inizio Processo (Start)
Questa transazione inizializza il processo di crafting e brucia/deposita i materiali necessari.

**Operazioni (in ordine):**
1. **CreateCraftingProcess** - Crea il processo e ottiene un `crafting_id` univoco
2. **DepositCraftingIngredient** - Deposita i materiali richiesti
3. **StartCraftingProcess** - Avvia effettivamente il processo di crafting

**Esempio da cache:**
```json
{
  "sig": "4JgY56CxyHtD",
  "time": 1770204683,
  "ops": [
    {
      "name": "CreateCraftingProcess",
      "data": {
        "crafting_id": 223816959954826,
        "key_index": 1,
        "num_crew": 11,
        "quantity": 150000,
        "recipe_category_index": 0
      }
    },
    {
      "name": "DepositCraftingIngredient",
      "data": {
        "amount": 450000,
        "ingredient_index": 0,
        "key_index": 1
      }
    },
    {
      "name": "StartCraftingProcess",
      "data": {
        "key_index": 1
      }
    }
  ]
}
```

### Transazione 2: Completamento Processo (Complete)
Questa transazione viene eseguita quando il crafting è completato (anche ore dopo) e recupera gli oggetti prodotti.

**Operazioni (in ordine):**
1. **BurnCraftingConsumables** - Brucia i materiali consumabili usati
2. **ClaimCraftingOutputs** - Reclama gli oggetti prodotti
3. **CloseCraftingProcess** - Chiude il processo di crafting

**Esempio da cache:**
```json
{
  "sig": "4imrCFgHKkjS",
  "time": 1770170768,
  "ops": [
    {
      "name": "BurnCraftingConsumables",
      "data": {
        "ingredient_index": 0
      }
    },
    {
      "name": "ClaimCraftingOutputs",
      "data": {
        "ingredient_index": 1
      }
    },
    {
      "name": "CloseCraftingProcess",
      "data": {
        "key_index": 1
      }
    }
  ]
}
```

## Operazioni di Crafting - Dettaglio

### 1. CreateCraftingProcess
- **Scopo:** Inizializza un nuovo processo di crafting
- **Campi chiave:**
  - `crafting_id`: ID univoco del processo (es. 223816959954826)
  - `key_index`: Indice della chiave (sempre 1 negli esempi)
  - `num_crew`: Numero di membri dell'equipaggio assegnati
  - `quantity`: Quantità da produrre (es. 150000)
  - `recipe_category_index`: Categoria della ricetta (0 per food/fuel)

### 2. DepositCraftingIngredient
- **Scopo:** Deposita i materiali necessari
- **Campi chiave:**
  - `amount`: Quantità di materiale (es. 450000)
  - `ingredient_index`: Indice del materiale (0-based)
  - `key_index`: Riferimento alla chiave del processo

### 3. StartCraftingProcess
- **Scopo:** Avvia effettivamente il timer di crafting
- **Campi chiave:**
  - `key_index`: Riferimento alla chiave del processo

### 4. BurnCraftingConsumables
- **Scopo:** Brucia i materiali consumabili (es. biomassa)
- **Campi chiave:**
  - `ingredient_index`: Indice del materiale bruciato

### 5. ClaimCraftingOutputs
- **Scopo:** Reclama gli oggetti prodotti (es. food, fuel)
- **Campi chiave:**
  - `ingredient_index`: Indice dell'output reclamato

### 6. CloseCraftingProcess
- **Scopo:** Chiude e pulisce il processo di crafting
- **Campi chiave:**
  - `key_index`: Riferimento alla chiave del processo

## Pattern Temporale

Dall'analisi delle operazioni nel profilo `4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8`:

### Transazioni "Start" (Create + Deposit + Start):
- 2hx5yi4i: 1770195236
- 3d5e62a3: 1770222470
- 3PMYXDE7: 1770166001
- 4JgY56Cx: 1770204683
- 5DzmxWPc: 1770189023
- bShxRvJC: 1770155741

### Transazioni "Complete" (Burn + Claim + Close):
- 4E1Yke5c: 1770218345
- 4imrCFgH: 1770170768
- 4m6k4BL6: 1770204054
- 5dwdcmBf: 1770179656
- 5XaZ3EVp: 1770141608

**Nota importante:** Le transazioni Complete possono avvenire PRIMA delle transazioni Start (es. 5XaZ3EVp Complete prima di bShxRvJC Start) perché si riferiscono a processi di crafting iniziati in precedenza e completati successivamente.

## Problema di Correlazione

**PROBLEMA:** Non è possibile correlare direttamente Start e Complete perché:
1. Il `crafting_id` appare solo in `CreateCraftingProcess` (transazione Start)
2. Le operazioni Burn/Claim/Close non contengono riferimenti al `crafting_id`
3. Usano solo `key_index` e `ingredient_index` che non sono univoci

**SOLUZIONE PROPOSTA:**
Per correlare le transazioni, sarebbe necessario:
1. Accedere ai dati on-chain del crafting process account
2. O tracciare i crafting_id attivi nel tempo
3. O usare l'analisi dei token transfers (preTokenBalances/postTokenBalances)

## Token Deltas per Identificazione

Un approccio alternativo è usare i **token deltas** per identificare il tipo di crafting:

### Material Mint Addresses (Token IDs)

I seguenti sono gli indirizzi dei token/materiali di Star Atlas SAGE identificati dalla cache:

| Material | Symbol | Mint Address | Notes |
|----------|--------|--------------|-------|
| ATLAS | ATLAS | `ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx` | In-game currency |
| Food | food | `foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG` | Crew consumable |
| Fuel | fuel | `fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim` | Ship fuel |
| Hydrogen | HYDR | `HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp` | Fuel crafting ingredient |
| Biomass | MASS | `MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog` | Food crafting ingredient |
| Stardust | SDU | `SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM` | Mining resource |

**Fonte:** Estratti da transazioni reali nel profilo `4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8` e verificati con la struttura `Mints` nel decoder ufficiale `/star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/types/mints.rs`.

**IMPORTANTE:** Questa lista è **incompleta**. Star Atlas SAGE ha molti più materiali (minerali, munizioni, componenti, ecc.) ma:
- I mint addresses **non sono documentati** nei repository ufficiali (star-atlas-decoders, star-atlas-cookbook)
- Sono **recuperati dinamicamente** on-chain dagli account del gioco
- Il package NPM `@staratlas/data-source` potrebbe contenere una lista completa ma non è open-source
- Questa lista contiene solo i materiali **effettivamente usati** nelle operazioni del profilo analizzato

Per ottenere una lista completa, sarebbe necessario:
1. Interrogare gli account SAGE on-chain per i mint addresses configurati
2. O usare il package `@staratlas/data-source` ufficiale
3. O costruire un database incrementale analizzando molte transazioni di giocatori diversi

### Crafting Patterns Identificati

### Food Crafting
- **Burned (Start):** MASS9G (Biomass) ~300,000-450,000
- **Claimed (Complete):** foodQJ (Food) ~150,000

### Fuel Crafting  
- **Burned (Start):** HYDR4E (Hydrogen) ~450,000
- **Claimed (Complete):** fueL3h (Fuel) ~150,000

### Esempio da Token Balances (4imrCFgH - Food Crafting Complete):
```
PreTokenBalances:
  - MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog (Biomass): 300,000
  - foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG (Food): 198,005,606,646
  - ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx (ATLAS): 8.1375

PostTokenBalances:
  - foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG (Food): 198,005,456,646 (delta: -150,000 burned)
  - foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG (Food, other account): 6,616,883 (delta: +150,000 claimed)
  - ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx (ATLAS): ~+8.14 (fee return)
```

**Interpretation:**
- **150,000 Biomass** was already burned in a previous "Start" transaction
- **150,000 Food** is being claimed from completed crafting process
- Fee paid in ATLAS with partial refund

### Mapping Mints to Material Names

Per mappare correttamente i mint addresses ai nomi dei materiali nel codice:

```typescript
const MATERIAL_MINTS: Record<string, string> = {
  'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx': 'ATLAS',
  'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG': 'Food',
  'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim': 'Fuel',
  'HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp': 'Hydrogen',
  'MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog': 'Biomass',
  'SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM': 'Stardust'
};

// Usage in UI
function formatMaterial(mint: string, amount: number): string {
  const name = MATERIAL_MINTS[mint] || `${mint.substring(0,8)}...`;
  return `${name} (${amount.toLocaleString()})`;
}
```

## Raccomandazioni per la UI

### Visualizzazione Raggruppata (Opzione 1: Semplice)
Mostrare le transazioni crafting come **singole righe** con:
- Tipo operazione principale (Start o Complete)
- Materiali burned/claimed aggregati
- Timestamp
- Fee totale

### Visualizzazione Dettagliata (Opzione 2: Espandibile)
```
Crafting [Start] - Food Production
├─ CreateCraftingProcess (crafting_id: 223816959954826)
├─ DepositCraftingIngredient (450,000 Biomass)
└─ StartCraftingProcess
   Fee: 0.000005 SOL | Time: 2026-02-04 10:31:23

Crafting [Complete] - Food Production  
├─ BurnCraftingConsumables (450,000 Biomass)
├─ ClaimCraftingOutputs (150,000 Food)
└─ CloseCraftingProcess
   Fee: 0.000005 SOL | Time: 2026-02-04 20:42:48
   Duration: ~10h 11m
```

### Visualizzazione con Correlazione (Opzione 3: Ideale)
Richiederebbe tracciamento adicional:
```
Crafting Process #223816959954826 - Food Production
├─ [Start]    2026-02-04 10:31:23 | Tx: 4JgY56Cx... | Fee: 0.000005 SOL
│  └─ Deposited: 450,000 Biomass
│
└─ [Complete] 2026-02-04 20:42:48 | Tx: 4imrCFgH... | Fee: 0.000005 SOL  
   ├─ Burned: 450,000 Biomass
   └─ Claimed: 150,000 Food
   
Total Duration: 10h 11m 25s
Total Fees: 0.000010 SOL
```

## Conclusioni

1. **Il crafting è un processo in 2 fasi** separate da intervalli temporali variabili
2. **Ogni fase è atomica** (tutte le operazioni in una singola transazione)
3. **La correlazione diretta non è possibile** senza dati on-chain aggiuntivi
4. **I token deltas forniscono informazioni** sul tipo e quantità di crafting
5. **La visualizzazione dovrebbe mostrare** le operazioni burne /claimed distintamente

## Dati Estratti dalla Cache

**Total Crafting Transactions:** 11
- Start Transactions: 6
- Complete Transactions: 5

**Crafting IDs Trovati:**
- 223816959954826 (4JgY56Cx)
- 57353243516078 (3d5e62a3)
- 100196707468574 (5DzmxWPc)
- 135155274359627 (bShxRvJC)
- 127980115762050 (3PMYXDE7)
