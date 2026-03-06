# Analisi di Fattibilità: Sistema di Tracking del Consumo di Risorse

## Executive Summary

Il progetto attualmente analizza le fee delle transazioni h24 del gioco Star Atlas SAGE. Questo documento valuta la fattibilità tecnica di estendere il sistema per tracciare i flussi di materiali (entrate/uscite) dai cargo account attraverso l'analisi delle stesse transazioni.

**Conclusione**: L'implementazione è **tecnicamente fattibile** con uno sforzo moderato. L'infrastruttura esistente fornisce già il 60-70% delle componenti necessarie.

---

## 1. Contesto Attuale

### 1.1 Architettura Esistente

Il sistema attuale:
- Fetch delle transazioni h24 per un profilo player
- Decodifica istruzioni SAGE tramite decoder Rust (Carbon)
- Estrazione fee e metadata delle transazioni
- Associazione operazioni a flotte tramite cargo/ammo/fuel account
- Aggregazione fee per flotta e per tipo di operazione

### 1.2 Componenti Rilevanti già Implementate

#### A. Estrazione Token Deltas (`buildFeesDetailed.ts`)
```typescript
function extractTokenDeltas(op: any): any {
  const preTokenBalances = op.txInfo?.preTokenBalances || [];
  const postTokenBalances = op.txInfo?.postTokenBalances || [];
  // ... calcola burned e claimed per mint
}
```

**Cosa fa**: Confronta `preTokenBalances` e `postTokenBalances` per ogni transazione, calcolando:
- Materiali bruciati (burned): token accounts che hanno perso valore
- Materiali rivendicati (claimed): token accounts che hanno guadagnato valore

**Limitazione attuale**: Utilizzato solo per operazioni di crafting identificate manualmente.

#### B. Associazione Cargo-Fleet (`associateOpsToFleets.ts`)
```typescript
const cargoKeys = new Set(fleets.map(f => f.cargoKey).filter(Boolean));
// Match operations by cargo account reference
```

**Cosa fa**: Associa ogni operazione alla flotta corrispondente tramite cargo/ammo/fuel account keys.

#### C. Decodifica SAGE Operations (`decodeInstructions.ts`)
- Parsing completo delle transazioni Solana
- Estrazione di tutti i metadati: `preTokenBalances`, `postTokenBalances`, `logMessages`, `innerInstructions`
- Decodifica istruzioni SAGE tramite Carbon decoder nativo

#### D. Enrichment Fleet State Handler (`fleetstatehandler.ts`)
- Parsing dei `logMessages` per estrarre informazioni dettagliate
- Identificazione stato flotta: `MineAsteroid`, `MoveSubwarp`, `Idle`
- Estrazione parametri operazione (es. `resource`, `amount_mined`)

---

## 2. Dati Disponibili per l'Analisi Risorse

### 2.1 Token Balances in ogni Transazione

Ogni transazione Solana contiene:

```json
{
  "preTokenBalances": [
    {
      "accountIndex": 6,
      "mint": "foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG",
      "owner": "9Pj6ZyMpNjbjhfMCvYGh3toaxx6v6TjxnGUrRRM24eU2",
      "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "uiTokenAmount": {
        "amount": "122",
        "decimals": 0,
        "uiAmount": 122,
        "uiAmountString": "122"
      }
    }
  ],
  "postTokenBalances": [
    {
      "accountIndex": 6,
      "mint": "foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG",
      "owner": "9Pj6ZyMpNjbjhfMCvYGh3toaxx6v6TjxnGUrRRM24eU2",
      "uiTokenAmount": {
        "amount": "100",
        "decimals": 0,
        "uiAmount": 100,
        "uiAmountString": "100"
      }
    }
  ]
}
```

**Implicazioni**:
- **Visibilità completa** dei movimenti di token in ogni transazione
- Identificazione univoca materiale tramite `mint` (token address)
- Quantità esatte pre/post operazione
- Owner identification per associare a cargo/wallet

### 2.2 Cargo Account Tracking

Il sistema già traccia:
- `cargoKey`: chiave pubblica del cargo account per ogni flotta
- `ammoKey`: chiave pubblica dell'ammo bank
- `fuelKey`: chiave pubblica del fuel tank

**Implicazioni**:
- **Associazione diretta** tra token account owner e cargo/ammo/fuel
- Possibilità di distinguere tra:
  - Operazioni sul cargo della flotta
  - Operazioni sul wallet del player
  - Trasferimenti tra cargo e wallet

### 2.3 Log Messages Mining

I `logMessages` contengono informazioni supplementari:
```
Program log: Current state: MineAsteroid(
  asteroid: 7wy6NvvB3fDW151rVXT64ZJ2F5SUtbx4nzrfyqNayGS6,
  resource: 6avcmj52Pb7NhWQ2Q9RVHtDUP5QnfajJE8eG38tPprkZ,
  amount_mined: 0
)
```

**Implicazioni**:
- Identificazione semantica dell'operazione (mining, crafting, movement)
- Estrazione parametri specifici (tipo risorsa, quantità)
- Cross-validation con token deltas

---

## 3. Approcci Implementativi

### 3.1 Approccio A: Token Delta Tracking (Consigliato)

**Principio**: Analizzare `preTokenBalances` vs `postTokenBalances` per ogni transazione, associando i flussi ai cargo account.

#### Workflow:
1. Per ogni transazione decodificata:
   - Estrarre `preTokenBalances` e `postTokenBalances`
   - Calcolare delta per ogni `accountIndex`
   - Identificare owner (cargo vs wallet vs starbase)
2. Classificare movimento:
   - **Entrata cargo**: delta positivo su account con owner = cargoKey
   - **Uscita cargo**: delta negativo su account con owner = cargoKey
   - **Consumo**: token burned (account presente in pre ma non in post)
   - **Produzione**: token minted (account presente in post ma non in pre)
3. Aggregare per:
   - Tipo materiale (mint)
   - Flotta (via cargo association)
   - Tipo operazione (mining, crafting, transfer)
   - Time window (hourly, daily)

#### Vantaggi:
✅ **Precisione massima**: dati on-chain nativi  
✅ **Copertura completa**: tutti i movimenti token sono tracciati  
✅ **Basso overhead**: dati già presenti nelle transazioni fetchate  
✅ **Riutilizzo codice**: `extractTokenDeltas` già implementato  

#### Limitazioni:
⚠️ **Ambiguità owner**: necessario mapping cargo account → flotta (già disponibile)  
⚠️ **Mint resolution**: serve mapping mint → nome materiale human-readable  
⚠️ **Inner instructions**: alcuni transfer possono essere nested (gestibile)  

#### Implementazione Stimata:
- **Complessità**: Bassa-Media
- **Effort**: 3-5 giorni
- **Files da modificare/creare**: 4-6

---

### 3.2 Approccio B: Cargo Account State Polling

**Principio**: Fetch periodico dello stato dei cargo account via RPC, confronto stato attuale vs precedente.

#### Workflow:
1. Identificare tutti i cargo account delle flotte
2. Fetch account info via `getAccountInfo` RPC
3. Decodificare buffer cargo (Rust decoder già disponibile)
4. Store snapshot stato cargo (inventory materiali)
5. Confrontare snapshot N vs snapshot N-1
6. Calcolare delta per materiale

#### Vantaggi:
✅ **Stato completo cargo**: visibilità inventory totale, non solo delta tx  
✅ **Indipendente da transazioni**: funziona anche senza tx recenti  
✅ **Validazione**: cross-check con token delta tracking  

#### Limitazioni:
❌ **RPC overhead**: richieste multiple per ogni cargo (cost, rate limits)  
❌ **Decoder gap**: necessità di implementare cargo decoder Rust (se non esistente)  
❌ **Storage**: necessità di persistere snapshot cargo storici  
❌ **Timing**: snapshot potrebbe non catturare tutti gli stati intermedi  
⚠️ **Attribution gap**: delta cargo non associato a transazione specifica  

#### Implementazione Stimata:
- **Complessità**: Media-Alta
- **Effort**: 7-12 giorni
- **Files da modificare/creare**: 8-12
- **Prerequisito**: Cargo account decoder in Rust/Carbon

---

### 3.3 Approccio C: Ibrido (Massima Qualità)

**Principio**: Combinare token delta tracking (A) con occasional cargo state polling (B) per validazione.

#### Workflow:
- **Real-time**: Token delta tracking per tutte le transazioni
- **Validation**: Cargo state polling ogni N ore per cross-check
- **Reconciliation**: Alert se discrepanze > soglia

#### Vantaggi:
✅ Massima accuratezza e coverage  
✅ Self-healing: discrepanze rilevate e corrette  
✅ Robustezza: failsafe se una fonte dati ha gap  

#### Limitazioni:
⚠️ Complessità implementativa maggiore  
⚠️ RPC overhead comunque presente (ma ridotto)  

#### Implementazione Stimata:
- **Complessità**: Alta
- **Effort**: 10-15 giorni
- **Files da modificare/creare**: 10-15

---

## 4. Roadmap Implementativa (Approccio A - Consigliato)

### Phase 1: Core Resource Tracking (3 giorni)

#### 1.1 Estendere `extractTokenDeltas`
**File**: `src/utils/extractTokenDeltas.ts` (nuovo)

Refactor di `extractTokenDeltas` da `buildFeesDetailed.ts` in utility standalone:
- Input: `op` (decoded operation)
- Output:
  ```typescript
  {
    deltas: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      preAmount: number;
      postAmount: number;
      delta: number;
      decimals: number;
    }>;
    burned: Array<{ mint: string; amount: number; owner: string }>;
    minted: Array<{ mint: string; amount: number; owner: string }>;
  }
  ```

#### 1.2 Cargo Association Logic
**File**: `src/utils/classifyTokenFlow.ts` (nuovo)

```typescript
export function classifyTokenFlow(
  delta: TokenDelta,
  fleet: FleetInfo
): TokenFlowType {
  if (delta.owner === fleet.cargoKey) {
    return delta.delta > 0 ? 'CARGO_IN' : 'CARGO_OUT';
  }
  if (delta.owner === fleet.ammoKey) {
    return delta.delta > 0 ? 'AMMO_IN' : 'AMMO_OUT';
  }
  if (delta.owner === fleet.fuelKey) {
    return delta.delta > 0 ? 'FUEL_IN' : 'FUEL_OUT';
  }
  return 'WALLET_TRANSFER';
}
```

#### 1.3 Aggregation Pipeline
**File**: `src/utils/aggregateResourceFlows.ts` (nuovo)

```typescript
export function aggregateResourceFlows(
  operations: DecodedOperation[],
  fleets: Fleet[]
): ResourceFlowSummary {
  const byFleet = new Map();
  const byMaterial = new Map();
  const byOperation = new Map();
  
  for (const op of operations) {
    const deltas = extractTokenDeltas(op);
    const fleet = findFleetForOperation(op, fleets);
    
    for (const delta of deltas.deltas) {
      const flowType = classifyTokenFlow(delta, fleet);
      // aggregate...
    }
  }
  
  return { byFleet, byMaterial, byOperation };
}
```

### Phase 2: Material Registry (1 giorno)

#### 2.1 Mint → Name Mapping
**File**: `src/utils/materialRegistry.ts` (nuovo)

Creare registry statico o dinamico per mapping:
```typescript
const MATERIAL_REGISTRY: Record<string, MaterialInfo> = {
  'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG': {
    name: 'Food',
    symbol: 'FOOD',
    category: 'consumable',
    decimals: 0
  },
  'HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp': {
    name: 'Hydrogen',
    symbol: 'HYDR',
    category: 'fuel',
    decimals: 0
  },
  // ...
};
```

**Opzioni**:
- Hardcoded: mappatura statica (rapido, limitato)
- Dynamic fetch: query on-chain metadata (SPL Token metadata program)
- Hybrid: cache + fallback to on-chain

### Phase 3: Integration & Reporting (1-2 giorni)

#### 3.1 Integrare in Pipeline Analisi
**File**: `src/analysis/fleetOrchestrator.ts` (modifica)

Aggiungere step dopo decodifica:
```typescript
// Existing: extractFees(ops)
const feeAnalysis = buildFeesDetailed(profileId);

// NEW: extractResourceFlows(ops)
const resourceAnalysis = aggregateResourceFlows(ops, fleets);

// Save to cache
await setCache('reports', 'resource-flows', resourceAnalysis, profileId);
```

#### 3.2 API Endpoint
**File**: `src/backend/routes/resource-flows.ts` (nuovo)

```typescript
router.get('/resource-flows/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const data = await getCache('reports', 'resource-flows', profileId);
  res.json(data);
});
```

#### 3.3 Frontend Display
**File**: `frontend/src/services/resource-flows.ts` (nuovo)

- Tabella materiali per flotta (in/out/net)
- Chart consumo risorse timeline
- Breakdown per operation type

---

## 5. Sfide Tecniche e Soluzioni

### 5.1 Ambiguità Owner in Token Balances

**Problema**: `owner` nei `preTokenBalances` potrebbe essere:
- PDA derivato (cargo/ammo/fuel)
- Wallet player
- Starbase loading bay
- Authority intermedio

**Soluzione**:
1. Costruire set di "known accounts": cargo/ammo/fuel keys per tutte le flotte
2. Per owner sconosciuti, analizzare `staticAccountKeys` + `addressTableLookups`
3. Fallback: classificare come "wallet transfer" se non match

### 5.2 Inner Instructions e Token Transfers Nested

**Problema**: Alcuni transfer sono in `innerInstructions`, non root instruction.

**Soluzione**:
- `preTokenBalances` e `postTokenBalances` sono **globali** alla transazione, già coprono inner instructions
- No processing custom necessario

### 5.3 Mint Resolution (Human-Readable Names)

**Problema**: Mint address non è human-friendly (`foodQJAztMzX1DKp...` → "Food").

**Soluzione**:
1. **Fase 1**: Hardcoded registry per materiali SAGE noti (20-30 materiali principali)
2. **Fase 2**: Fallback a fetch metadata on-chain (SPL Token Metadata)
3. **Fase 3**: Cache mint metadata localmente dopo primo fetch

**Effort addizionale**: +1 giorno per implementare fetch metadata dinamico.

### 5.4 Performance & Storage

**Problema**: Volume dati può crescere rapidamente (migliaia di tx/giorno).

**Soluzione**:
- **Aggregation**: Calcolare summaries aggregate (per ora, per giorno)
- **Retention**: Purge raw deltas dopo N giorni, mantenere solo aggregates
- **Indexing**: Cache per material, per fleet, per operation type

**Storage stimato** (per profilo):
- Raw deltas: ~5 KB per tx × 2000 tx/day = ~10 MB/day
- Aggregates: ~50 KB/day
- Con retention 7 giorni raw + 90 giorni aggregates: ~75 MB per profilo

---

## 6. Output Attesi

### 6.1 Resource Flow Report (JSON)

```json
{
  "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
  "timeWindow": "24h",
  "summary": {
    "totalMaterialsIn": 125000,
    "totalMaterialsOut": 98000,
    "netChange": 27000,
    "materialsTracked": 15
  },
  "byFleet": {
    "FleetAlpha_Cargo_PubKey": {
      "callsign": "Alpha-1",
      "isRented": false,
      "materials": {
        "foodQJAz...": {
          "name": "Food",
          "in": 5000,
          "out": 3200,
          "net": 1800,
          "operations": {
            "mining": { "in": 0, "out": 3200 },
            "cargo_transfer": { "in": 5000, "out": 0 }
          }
        },
        "HYDR4EPH...": {
          "name": "Hydrogen",
          "in": 10000,
          "out": 8500,
          "net": 1500,
          "operations": {...}
        }
      }
    }
  },
  "byMaterial": {
    "foodQJAz...": {
      "name": "Food",
      "totalIn": 25000,
      "totalOut": 18000,
      "net": 7000,
      "topFleets": ["FleetAlpha", "FleetBeta"],
      "topOperations": ["mining", "cargo_transfer"]
    }
  },
  "byOperation": {
    "mining": {
      "materialsProduced": {
        "HYDR4EPH...": 15000,
        "foodQJAz...": 0
      },
      "materialsConsumed": {
        "foodQJAz...": 5000,
        "ammoK8Ak...": 300
      }
    },
    "crafting": {
      "materialsProduced": {...},
      "materialsConsumed": {...}
    }
  }
}
```

### 6.2 Frontend Display

#### Dashboard "Resource Flows"
- **KPI Cards**:
  - Total Materials In/Out (24h)
  - Net Change per category (fuel/food/ammo/minerals)
  - Most consumed material
  - Most produced material

- **Charts**:
  - Timeline: Material flows per hour (line chart)
  - By material: Top 10 materials by volume (bar chart)
  - By fleet: Resource consumption heatmap
  - By operation: Pie chart production vs consumption

- **Tables**:
  - Fleet details: Exp/collapse per fleet, lista materiali in/out
  - Material details: Exp/collapse per material, lista operazioni che lo usano

---

## 7. Risks & Mitigations

### Risk 1: Mint Registry Incomplete
**Probabilità**: Media  
**Impatto**: Medio  
**Mitigazione**: 
- Start con top 20 materiali hardcoded
- Fallback a mint address substring se nome non disponibile
- Implementare fetch dinamico metadata in Phase 2

### Risk 2: Cargo Account Ownership Ambiguity
**Probabilità**: Bassa  
**Impatto**: Medio  
**Mitigazione**: 
- Logging dettagliato per owner classification failures
- Manual review primi 100 casi
- Adjustable classification rules

### Risk 3: Performance Degradation
**Probabilità**: Bassa  
**Impatto**: Alto  
**Mitigazione**: 
- Aggregation preventiva in pipeline
- Lazy loading in frontend
- Caching aggressivo
- Profiling dopo Phase 1

### Risk 4: Inner Instructions Token Transfers Missed
**Probabilità**: Molto Bassa  
**Impatto**: Medio  
**Mitigazione**: 
- Token balances sono globali, già coprono inner instructions
- Testing su tx complesse (crafting multi-step)

---

## 8. Effort Summary

### Approccio A (Consigliato)

| Phase | Task | Effort | Complexity |
|-------|------|--------|------------|
| 1.1 | Refactor `extractTokenDeltas` | 0.5 day | Low |
| 1.2 | Cargo association logic | 1 day | Low-Med |
| 1.3 | Aggregation pipeline | 1.5 days | Medium |
| 2.1 | Material registry | 1 day | Low |
| 3.1 | Integration in pipeline | 0.5 day | Low |
| 3.2 | API endpoint | 0.5 day | Low |
| 3.3 | Frontend display | 2 days | Medium |
| **TOTAL** | | **7 days** | **Low-Med** |

### Opzionale: Enhanced Features

| Feature | Effort | Priority |
|---------|--------|----------|
| Dynamic mint metadata fetch | +1 day | Medium |
| Historical trends (7d/30d) | +1 day | Low |
| Cargo state validation (Approach B hybrid) | +5 days | Low |
| Export to CSV/Excel | +0.5 day | Low |
| Material price valuation (USD) | +2 days | Medium |

---

## 9. Decisioni Architetturali

### 9.1 Storage Strategy

**Opzione A**: Extend existing cache structure
```
cache/
  <profileId>/
    resource-flows/
      daily-YYYY-MM-DD.json
      summary-24h.json
```

**Opzione B**: Dedicated database
- Pro: Query performance, relational data
- Contro: Dependency, complexity
- **Raccomandazione**: Opzione A per Phase 1, valutare DB se scaling needed

### 9.2 Aggregation Level

**Granularità**:
- **Per transaction**: Troppo granulare, storage intensivo
- **Per hour**: Buon compromesso per charts
- **Per day**: Per long-term trends
- **Raccomandazione**: Salvare raw deltas, pre-aggregate hourly + daily

### 9.3 Material Registry Source

**Opzione A**: Hardcoded static registry
**Opzione B**: On-chain metadata fetch
**Opzione C**: Hybrid (cache + fallback)
**Raccomandazione**: Opzione C

---

## 10. Conclusioni e Next Steps

### 10.1 Fattibilità: ALTA ✅

L'implementazione è **fattibile** con l'architettura esistente:
- ✅ Dati necessari già presenti nelle transazioni fetchate
- ✅ Associazione cargo-fleet già implementata
- ✅ Decodifica SAGE operations già funzionante
- ✅ Infrastruttura caching e aggregation già presente

### 10.2 Raccomandazione

**Procedere con Approccio A** (Token Delta Tracking):
- **Effort sostenibile**: 5-7 giorni development
- **Riutilizzo codice**: 60-70% componenti già presenti
- **ROI alto**: Insight prezioso con overhead minimo
- **Extensible**: Base solida per future enhancements

### 10.3 Immediate Next Steps

1. **Approval stakeholder**: Validare requirement e priorità
2. **Spike tecnico** (1 day):
   - Test `extractTokenDeltas` su campione tx diverse
   - Verificare coverage mint registry (top 20 materiali)
   - Prototipo aggregation per 1 flotta
3. **Implementation Phase 1** (3 days): Core tracking
4. **Testing & Validation** (1 day): Cross-check manuale su sample
5. **Implementation Phase 2-3** (3 days): Registry + Integration
6. **Deploy & Monitor** (1 day): Release graduale, monitoring

### 10.4 Success Metrics

Post-implementazione, tracciare:
- **Coverage**: % transazioni con material deltas identificati
- **Accuracy**: Discrepanze vs manual review
- **Performance**: Overhead computazionale (<10% acceptable)
- **Adoption**: Usage frontend dashboard da parte utenti

---

## Appendice A: Schema Dati

### DecodedOperation (Existing)
```typescript
{
  signature: string;
  instructionName: string;
  decoded: any[];
  txInfo: {
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    // ...
  };
}
```

### TokenDelta (New)
```typescript
{
  accountIndex: number;
  mint: string;
  owner: string;
  preAmount: number;
  postAmount: number;
  delta: number;
  decimals: number;
  flowType: 'CARGO_IN' | 'CARGO_OUT' | 'AMMO_IN' | 'AMMO_OUT' | 'FUEL_IN' | 'FUEL_OUT' | 'WALLET';
}
```

### ResourceFlowSummary (New)
```typescript
{
  profileId: string;
  timeWindow: string;
  summary: {
    totalMaterialsIn: number;
    totalMaterialsOut: number;
    netChange: number;
    materialsTracked: number;
  };
  byFleet: Map<string, FleetResourceFlow>;
  byMaterial: Map<string, MaterialFlow>;
  byOperation: Map<string, OperationResourceFlow>;
}
```

---

## Appendice B: Reference Implementation Sketch

### extractTokenDeltas.ts
```typescript
export function extractTokenDeltas(op: DecodedOperation): TokenDeltaResult {
  const pre = op.txInfo?.preTokenBalances || [];
  const post = op.txInfo?.postTokenBalances || [];
  
  const preMap = new Map(pre.map(p => [p.accountIndex, p]));
  const postMap = new Map(post.map(p => [p.accountIndex, p]));
  
  const allIndexes = new Set([...preMap.keys(), ...postMap.keys()]);
  
  const deltas: TokenDelta[] = [];
  const burned: BurnedToken[] = [];
  const minted: MintedToken[] = [];
  
  for (const idx of allIndexes) {
    const preBalance = preMap.get(idx);
    const postBalance = postMap.get(idx);
    
    if (preBalance && !postBalance) {
      burned.push({
        mint: preBalance.mint,
        amount: preBalance.uiTokenAmount.uiAmount,
        owner: preBalance.owner,
        decimals: preBalance.uiTokenAmount.decimals
      });
    } else if (!preBalance && postBalance) {
      minted.push({
        mint: postBalance.mint,
        amount: postBalance.uiTokenAmount.uiAmount,
        owner: postBalance.owner,
        decimals: postBalance.uiTokenAmount.decimals
      });
    } else if (preBalance && postBalance) {
      const preAmount = parseFloat(preBalance.uiTokenAmount.amount);
      const postAmount = parseFloat(postBalance.uiTokenAmount.amount);
      const delta = postAmount - preAmount;
      
      if (delta !== 0) {
        deltas.push({
          accountIndex: idx,
          mint: preBalance.mint,
          owner: preBalance.owner,
          preAmount,
          postAmount,
          delta: delta / Math.pow(10, preBalance.uiTokenAmount.decimals),
          decimals: preBalance.uiTokenAmount.decimals,
          flowType: 'UNCLASSIFIED' // classifyTokenFlow will update this
        });
      }
    }
  }
  
  return { deltas, burned, minted };
}
```

---

**Documento compilato il**: 5 Marzo 2026  
**Autore**: AI Analysis System  
**Versione**: 1.0  
**Status**: Draft for Review
