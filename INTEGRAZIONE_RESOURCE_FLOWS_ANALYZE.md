# Integrazione di Resource Flows nel Flusso di Analyze

## Executive Summary

Questo documento valuta l'integrazione della funzione `decodeResources()` nel pipeline di `analyze-profile`, proponendo di aggiungere l'analisi del consumo di risorse al payload finale, **prima della cancellazione della cache**.

**Conclusione**: L'integrazione è **tecnicamente fattibile e raccomandata** con impatto minimo sul flusso esistente.

---

## 1. Contesto Attuale

### 1.1 Flusso di Analyze (7 Fasi)

Il endpoint `POST /api/analyze-profile` orchestra 7 fasi sequenziali:

```
FASE 1: Get Wallet Authority
    ↓
FASE 2: Get Wallet Txs (h24)
    ↓
FASE 3: Decode SAGE Ops (Carbon decoder)
    ↓
FASE 4: Get Fleets
    ↓
FASE 5: Get Rented Fleets
    ↓
FASE 6: Associate SAGE Ops to Fleets
    ↓
FASE 7: Playload (Aggregazione finale + buildFeesDetailed)
    ↓
SALVA PLAYLOAD IN CACHE
    ↓
PULIZIA CACHE (se cachePersist=false)
    ↓
RETURN RESPONSE
```

### 1.2 Output Corrente della Fase 7

Il playload finale contiene:
```typescript
{
  // ... dati da playloadHandler
  feesByFleet: {},       // Aggregato fee per fleet
  feesByOperation: {},   // Aggregato fee per operazione
  sageFees24h: number,   // Tot fee SAGE h24
  totalSignaturesFetched: number,
  transactionCount24h: number,
  fromCache: boolean,
  firstTxTime: number,
  breakdown: { feesByFleet: {} }
}
```

### 1.3 Meccanismo di Cleanup

Prima di ritornare una risposta (se `cachePersist=false`):
```typescript
// Mantiene SOLO:
// - cache/<profileId>/playload/latest.json

// Cancella:
// - cache/<profileId>/sage-ops/
// - cache/<profileId>/fleet-breakdowns/
// - cache/<profileId>/player-ops/
// - cache/<profileId>/fleets/
// - cache/<profileId>/rented-fleets/
// - cache/<profileId>/reports/
// - Tutti gli altri files/cartelle
```

---

## 2. Proposta di Integrazione

### 2.1 Punto di Inserimento

Inserire la fase **8: Resource Flows Analysis** tra la costruzione del merged payload e la pulizia della cache:

```
... FASE 7 ...
    ↓
FASE 8: Resource Flows Analysis  ← NEW
    ↓
SALVA PLAYLOAD ESTESO IN CACHE
    ↓
PULIZIA CACHE (se cachePersist=false)
    ↓
RETURN RESPONSE
```

### 2.2 Pseudo-Code di Integrazione

```typescript
// Dopo buildFeesDetailed e costruzione merged
try {
  // NUOVA FASE 8: Resource Flows Analysis
  console.log("###################### INIZIO FASE 8: RESOURCE FLOWS ANALYSIS #########################");
  const resourceFlows = await decodeResources(profileId);
  const extendedPlayload = Object.assign({}, merged, {
    resourceFlows: {
      summary: resourceFlows.summary,
      byFleet: resourceFlows.byFleet,
      byMaterial: resourceFlows.byMaterial,
      byOperation: resourceFlows.byOperation
    }
  });
  
  // Salva il playload esteso
  await setCache('playload', 'latest', extendedPlayload, profileId);
  console.log("###################### FINE FASE 8, INIZIO CLEANUP #########################");
  
  // Cleanup cache (se cachePersist=false)
  if (!cachePersist) {
    await clearNamespaces(profileId);  // Mantiene solo playload/latest.json
  }
  
  return res.json(extendedPlayload);
} catch (e) {
  // Error handling con fallback
}
```

---

## 3. Analisi Dettagliata

### 3.1 Vantaggi dell'Integrazione

✅ **Dati Coerenti**
- Resource flows calcolati sugli stessi dati già elaborati (phase 2-7)
- Guarantee di consistenza: stessi txs, stesse fleets, stesso time window

✅ **Transazionalità**
- Salvataggio atomico: playload + resource flows insieme in cache
- Se decodeResources fallisce, il playload base rimane disponibile (fallback)

✅ **Efficienza**
- Non richiede re-fetch dati (riusa fleets e operations già caricate)
- Overhead minimo: +2-3 secondi per la fase 8 (processing già fatto in fase 3-6)

✅ **Frontend Unificato**
- Single API call restituisce fees + resources
- No API orchestration lato frontend
- Riduce latency percepita

✅ **Gestione della Cache Consistente**
- Resources salvati accanto a fee data
- Cleanup manager unico per tutti i dati temporanei
- Evita stale data tra fee e resources

### 3.2 Limitazioni e Rischi

⚠️ **Overhead di Latency**
- Aggiungerà ~2-5 secondi al endpoint `/analyze-profile`
- **Mitigazione**: Mostrare logging dettagliato per user awareness

⚠️ **Complessità di Error Handling**
- Se decodeResources fallisce, cosa restituire?
 Fallback a merged senza resources (conservative)


⚠️ **Dipendenza da Cache Integrità**
- Se phase 2-6 ha salvato dati incompleti, phase 8 avrà risultati degradati
- **Mitigazione**: Validazione dati input in decodeResources

### 3.3 Performance Impact

**Timing Stimato**
```
Fase 1: Get Wallet Authority    ~1s
Fase 2: Get Wallet Txs          ~3s
Fase 3: Decode SAGE Ops         ~15s
Fase 4: Get Fleets              ~2s
Fase 5: Get Rented Fleets       ~2s
Fase 6: Associate SAGE Ops      ~1s
Fase 7: Playload + buildFees    ~5s
────────────────────────────────────
FASE 8: Resource Flows         +2-4s  ← NEW
────────────────────────────────────
Total senza Phase 8: ~29s
Total con Phase 8:   ~31-33s
Overhead: ~7% latency increase
```

**Memory Footprint**
```
Fase 3: Decoded ops in memory          ~5-10 MB  (liberato dopo save)
Fase 6: Breakdown structures           ~2-3 MB   (liberato dopo save)
Fase 7: Merged payload                 ~2-3 MB
────────────────────────────────────────────────
Fase 8: ResourceFlows object           ~1-2 MB
Peak simultaneous allocation:          ~6-8 MB
Cleanup: Rilascio immediato post-save  ← OK per VM
```

---

## 4. Implementazione Tecnica

### 4.1 Modifiche Richieste

#### File: `src/analysis/analyzeProfile.ts`

**Change 1**: Aggiungere import
```typescript
import { decodeResources } from '../utils/resources_analyses';
```

**Change 2**: Aggiungere fase 8 nel blocco try di playload handling (after buildFeesDetailed)
```typescript
// Dopo: await setCache('playload', 'latest', merged, profileId);
// E prima del: if (!cachePersist) { clearNamespaces... }

try {
  console.log("###################### INIZIO FASE 8: RESOURCE FLOWS ANALYSIS #########################");
  const startPhase8 = Date.now();
  
  const resourceFlows = await decodeResources(profileId as string);
  
  const extendedPayload = Object.assign({}, merged, {
    resourceFlows: {
      summary: resourceFlows.summary,
      byFleet: resourceFlows.byFleet,
      byMaterial: resourceFlows.byMaterial,
      byOperation: resourceFlows.byOperation
    }
  });
  
  // Update saved playload with resource flows
  try {
    await setCache('playload', 'latest', extendedPayload, profileId as string);
    const phase8Duration = Date.now() - startPhase8;
    console.log(`[analyze-profile] Phase 8 completed in ${phase8Duration}ms`);
  } catch (saveErr) {
    console.error('[analyze-profile] failed to save extended playload cache', saveErr);
  }
  
  console.log("###################### FINE FASE 8: INIZIO CLEANUP #########################");
  
  // ... existing cleanup code ...
  
  return res.json(extendedPayload);  // Return extended instead of merged
  
} catch (resourceErr) {
  console.warn('[analyze-profile] Phase 8 (Resource Flows) failed, returning base payload', resourceErr);
  
  // Fallback: return merged without resources
  // (Fase 7 playload was already saved, so not a total loss)
  
  if (!cachePersist) {
    // ... existing cleanup code ...
  }
  
  return res.json(merged);  // Fallback to base payload
}
```

### 4.2 Schema di Output Esteso

**Response JSON dopo integrazione**:
```json
{
  "feesByFleet": { ... },
  "feesByOperation": { ... },
  "sageFees24h": 125000,
  "transactionCount24h": 1841,
  
  "resourceFlows": {
    "summary": {
      "totalMaterialsIn": 5597488.8,
      "totalMaterialsOut": 8291622.36,
      "netChange": -2694133.56,
      "materialsTracked": 6,
      "fleetsAnalyzed": 7,
      "operationsAnalyzed": 12,
      "transactionsProcessed": 1841
    },
    "byFleet": {
      "FleetKey1": {
        "callsign": "Alpha-1",
        "isRented": false,
        "totalMaterialsIn": 500000,
        "totalMaterialsOut": 600000,
        "totalMaterialsNet": -100000,
        "materials": { ... }
      }
    },
    "byMaterial": {
      "MintAddress1": {
        "name": "Food",
        "totalIn": 100000,
        "totalOut": 80000,
        "net": 20000,
        "operations": { ... },
        "topFleets": [ ... ]
      }
    },
    "byOperation": {
      "FleetStateHandler_MineAsteroid": {
        "operationCount": 500,
        "materialsProduced": { "MintAddress1": 1000000 },
        "materialsConsumed": { "MintAddress2": 500000 },
        "fleets": [ ... ]
      }
    }
  }
}
```

### 4.3 Modalità Backward Compatibility

**Scenario A**: Client attualmente usa solo `feesByFleet` e `feesByOperation`
- ✅ Continua a funzionare (campi presenti)
- ✅ Nuovi campi `resourceFlows` ignorati se non utilizzati

**Scenario B**: Frontend aggiornato per usare `resourceFlows`
- ✅ Dati disponibili nel payload
- ✅ Single API call, no extra requests

---

## 5. Strategie di Error Handling

### 5.1 Scenario: decodeResources Timeout

**Problema**: Phase 8 impiega >30s, timeout Express

**Soluzione**:
```typescript
const resourceFlowsPromise = Promise.race([
  decodeResources(profileId),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Phase 8 timeout')), 20000)
  )
]);

try {
  resourceFlows = await resourceFlowsPromise;
} catch (e) {
  console.warn('[analyze-profile] Phase 8 timeout or error, using fallback');
  // Fallback senza resources
}
```

### 5.2 Scenario: Cache Corruption in Phase 3-6

**Problema**: fleet-breakdowns o player-ops incompleti

**Soluzione**: 
- decodeResources già ha try-catch su file reads
- Tolera file malformati (skips them)
- Returns partial results anziché crash

### 5.3 Scenario: cachePersist=true

**Problema**: User richiede di mantenere tutti i dati temporanei

**Soluzione**: 
- Phase 8 salva in cache come al solito
- Cleanup skipped se cachePersist=true
- Tutti i dati (sage-ops, fleet-breakdowns, resources) rimangono
- Utile per debug e analisi offline

---

## 6. Frontend Integration Guide

### 6.1 Consumo nel Frontend

**Attuale** (solo fee):
```typescript
const { feesByFleet, feesByOperation, sageFees24h } = analyzeResponse.data;
```

**Nuovo** (con resources):
```typescript
const { 
  feesByFleet, 
  feesByOperation, 
  sageFees24h,
  resourceFlows  // NEW
} = analyzeResponse.data;

if (resourceFlows) {
  // Display resource consumption dashboard
  console.log(`Materials in: ${resourceFlows.summary.totalMaterialsIn}`);
  console.log(`Materials out: ${resourceFlows.summary.totalMaterialsOut}`);
  console.log(`Net change: ${resourceFlows.summary.netChange}`);
  
  // Per-fleet resource analysis
  for (const [fleetKey, fleetData] of Object.entries(resourceFlows.byFleet)) {
    console.log(`Fleet ${fleetData.callsign}: ${fleetData.totalMaterialsNet} net`);
  }
}
```

### 6.2 Graceful Degradation

Se `resourceFlows` non presente (backward compat):
```typescript
const resourceFlows = analyzeResponse.data?.resourceFlows;
if (resourceFlows) {
  // Render resource dashboard
} else {
  // Hide resource tab, show only fees
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**Test 1**: Fase 8 con cache completa
```typescript
describe('Phase 8: Resource Flows Integration', () => {
  it('should include resourceFlows in extended payload', async () => {
    const response = await POST('/analyze-profile', { 
      profileId: TEST_PROFILE,
      cachePersist: false
    });
    
    expect(response.resourceFlows).toBeDefined();
    expect(response.resourceFlows.summary).toBeDefined();
    expect(response.resourceFlows.byFleet).toBeDefined();
  });
});
```

**Test 2**: Fallback su error
```typescript
it('should fallback to merged if Phase 8 fails', async () => {
  // Mock decodeResources to throw
  sinon.stub(resources_analyses, 'decodeResources').rejects(new Error('Simulated Phase 8 failure'));
  
  const response = await POST('/analyze-profile', { 
    profileId: TEST_PROFILE
  });
  
  // Should have fees but not resources
  expect(response.feesByFleet).toBeDefined();
  expect(response.resourceFlows).toBeUndefined();
});
```

### 7.2 Integration Tests

**Test 3**: Full pipeline timing
```typescript
it('should complete analyze + phase 8 within 35s', async () => {
  const start = Date.now();
  await POST('/analyze-profile', { profileId: TEST_PROFILE });
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(35000);
});
```

**Test 4**: Cache persistence
```typescript
it('should save extended payload to playload/latest.json', async () => {
  await POST('/analyze-profile', { 
    profileId: TEST_PROFILE,
    cachePersist: true
  });
  
  const cachedFile = fs.readFileSync(
    `cache/${TEST_PROFILE}/playload/latest.json`
  );
  const cached = JSON.parse(cachedFile);
  
  expect(cached.data.resourceFlows).toBeDefined();
});
```

---

## 8. Deployment Checklist

- [ ] Implementare Phase 8 in analyzeProfile.ts
- [ ] Aggiungere import per decodeResources
- [ ] Implementare error handling e fallback
- [ ] Test unitari per Phase 8 success path
- [ ] Test unitari per Phase 8 failure path
- [ ] Test integrazione timing (<35s)
- [ ] Test cache persistence con resourceFlows
- [ ] Test backward compatibility (client senza resourceFlows handling)
- [ ] Update API documentation
- [ ] Update frontend per consumo resourceFlows
- [ ] Deploy con logging inizialmente verbose
- [ ] Monitor Phase 8 latency in produzione
- [ ] Rollback plan se issues rilevate

---

## 9. Conclusioni e Raccomandazioni

### 9.1 Fattibilità: ALTA ✅

L'integrazione è **tecnicamente solida**:
- È un inserimento lineare nel flusso
- Error handling è gestibile con fallback
- Overhead di ~7% latency è accettabile
- Memory footprint è minore
- Backward compatibility garantita

### 9.2 Raccomandazione

**PROCEDERE con l'integrazione** con i seguenti accorgimenti:

1. **Implementare Phase 8 con try-catch/fallback** (non fail-fast)
2. **Aggiungere logging dettagliato** per phase 8 timing
3. **Monitorare latency** post-deploy per valutare impact reale
4. **Implementare timeout** (~20s) per Phase 8 per evitare backend hang
5. **Update frontend progressivamente** (inizialmente ignora resourceFlows)
6. **Usare feature flag** per enable/disable Phase 8 se neccessario

### 9.3 Timing Implementazione

- **Implementation**: 2-3 giorni (integrazione + testing)
- **Testing**: 1-2 giorni
- **Rollout**: Graduale con monitoring
- **Stabilizzazione**: 1 settimana

---

## Appendice A: Codice di Integrazione Completo (Reference)

Vedere section 4.1 per snippets. Nel file `src/analysis/analyzeProfile.ts`:

1. Aggiungere import all'inizio
2. Aggiungere try-catch block DOPO `await setCache('playload', 'latest', merged, ...)`
3. Modificare il cleanup per mantenere anche `resources/` se desiderato
4. Ritornare `extendedPayload` anziché `merged`
5. Implementare fallback a `merged` se Phase 8 fallisce

---

**Documento compilato il**: 5 Marzo 2026  
**Versione**: 1.0  
**Status**: Ready for Implementation
