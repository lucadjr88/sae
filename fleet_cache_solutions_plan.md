# Piano di Implementazione Soluzioni Cache Fleet Incomplete

## Data del Piano
29 dicembre 2025

## Contesto
Basandosi sull'analisi dettagliata in `fleet_cache_analysis.md`, questo piano definisce l'implementazione delle soluzioni per risolvere il problema delle flotte rented con dati incompleti (`data.data` vuoto). Il problema è strutturale: le rented fleets non espongono sub-account completi per limiti del protocollo SAGE.

## Obiettivi
- **Obiettivo Primario**: Garantire associazione corretta delle transazioni per tutte le flotte, incluse quelle rented
- **Obiettivo Secondario**: Migliorare affidabilità e completezza della cache fleet
- **Obiettivo Terziario**: Fornire feedback utente su limitazioni dei dati

## Soluzioni Prioritarie e Piani di Implementazione

### 1. Implementare Fallback Association (Priorità: Alta)
**Problema**: Transazioni che coinvolgono sub-account di rented fleets non vengono associate perché `accountToFleet` è costruito solo da cache.

**Soluzione**: Aggiungere logica alternativa per associare transazioni a rented fleets usando pattern euristici oltre ai sub-account.

#### Architettura Tecnica
- **File Target**: `src/examples/wallet-sage-fees-detailed.ts`
- **Funzione Target**: `getWalletSageFeesDetailed()` intorno linea 400
- **Strategia**: Post-processing association per rented fleets dopo associazione standard

#### Passi di Implementazione Dettagliati

1. **Analisi Pattern Transazioni Rented**
   ```bash
   # Estrarre transazioni per rented fleets
   jq '.transactions[] | select(.accountKeys | contains(["EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg"]))' debug_response.json > rented_fleet_txs.json
   
   # Analizzare pattern account
   jq '. | {signature: .signature, accountKeys: .accountKeys, instructions: .instructions}' rented_fleet_txs.json | head -20
   ```
   **Output Atteso**: Documento pattern identificati (es. cargo ops coinvolgono 3-4 account specifici)

2. **Implementare Heuristica Association**
   - **Modificare**: `src/examples/wallet-sage-fees-detailed.ts`
   - **Posizione**: Dopo il loop principale di associazione (dopo linea ~450)
   - **Logica**:
     ```typescript
     // Aggiungere dopo feesByFleet population
     for (const tx of transactions) {
       if (!tx.fleetAssigned) { // Nuovo flag per tracciare
         const rentedFleet = findRentedFleetByHeuristics(tx, rentedFleets);
         if (rentedFleet) {
           assignTransactionToFleet(tx, rentedFleet, feesByFleet);
           tx.fleetAssigned = true;
         }
       }
     }
     ```
   - **Funzione Helper**: `findRentedFleetByHeuristics(tx, rentedFleets)`
     - Controlla proximity: fleet key + account sconosciuto entro 2 posizioni
     - Controlla istruzioni caratteristiche (es. "Cargo" in instruction names)
     - Ritorna fleet key o null

3. **Testing e Validazione**
   ```typescript
   // Unit test structure
   describe('Fallback Association', () => {
     it('should associate cargo transactions to rented fleets', () => {
       const tx = { accountKeys: ['fleetKey', 'unknownAccount'], instructions: ['CargoDeposit'] };
       const result = findRentedFleetByHeuristics(tx, ['fleetKey']);
       expect(result).toBe('fleetKey');
     });
   });
   ```
   **Metriche**: Accuracy test con 100+ transazioni reali

4. **Deployment Graduale**
   - Feature flag: `ENABLE_RENTED_FALLBACK_ASSOCIATION`
   - Rollout: 10% rented fleets → 50% → 100%
   - Monitoring: Log associazioni fallback per audit

#### Timeline: 2-3 settimane
#### Rischi: Possibili associazioni errate, richiede tuning dei parametri euristici
#### Metriche: % transazioni associate correttamente per rented fleets

### 2. Migliorare Fetching Rented Fleets (Priorità: Media)
**Problema**: `data.data` vuoto per rented fleets limita recupero sub-account.

**Soluzione**: Implementare metodi alternativi per recuperare informazioni sub-account di rented fleets.

#### Architettura Tecnica
- **File Target**: `src/examples/fleet-modules/fleet-processor.ts`
- **Nuovo Modulo**: `src/examples/fleet-modules/rented-fleet-enricher.ts`
- **Strategia**: Post-fetch enrichment per rented fleets usando wallet authority

#### Passi di Implementazione Dettagliati

1. **Analisi Protocollo SAGE**
   - **Ricerca**: Consultare SAGE IDL per campi accessibili a renter
   - **Query Test**: Usare `readAllFromRPCWithRetry` con filtri alternativi
   - **Output**: Lista campi recuperabili per rented fleets

2. **Implementare Fetching Alternativo**
   ```typescript
   // Nuovo file: rented-fleet-enricher.ts
   export async function enrichRentedFleetData(fleet: any, walletAuthority: string, connection) {
     if (!fleet.isRented) return fleet;
     
     // Tentativo recupero sub-account via wallet authority
     const enrichedData = await fetchSubAccountsViaAuthority(fleet.key, walletAuthority, connection);
     
     return {
       ...fleet,
       data: {
         ...fleet.data,
         ...enrichedData // Merge dati aggiuntivi
       }
     };
   }
   ```
   - **Integrazione**: Chiamare in `fleet-processor.ts` dopo costruzione base
   - **Caching**: Salvare dati enriched separatamente per evitare sovrascrittura

3. **Ottimizzazione Performance**
   - **Batch Processing**: Processare rented fleets in parallelo con limit 5 concurrent
   - **Timeout**: 10 secondi per fleet, skip se timeout
   - **Metrics**: Log tempo fetching per ottimizzazione

4. **Fallback Graceful**
   ```typescript
   try {
     const enriched = await enrichRentedFleetData(fleet, walletAuthority, connection);
     return enriched;
   } catch (error) {
     console.warn(`Failed to enrich rented fleet ${fleet.key}:`, error.message);
     return fleet; // Ritorna dati originali
   }
   ```

#### Timeline: 3-4 settimane
#### Rischi: Aumento load RPC, possibili rate limits
#### Metriche: % rented fleets con dati completi dopo miglioramento

### 3. Validazione Cache (Priorità: Media-Alta)
**Problema**: Cache accetta e salva dati incompleti senza validazione.

**Soluzione**: Implementare controlli di completezza prima del salvataggio in cache.

#### Architettura Tecnica
- **File Target**: `src/utils/persist-cache.js` o nuovo `src/utils/cache-validator.js`
- **Hook Point**: Prima di `setCache()` in `src/routes/fleets.ts`

#### Passi di Implementazione Dettagliati

1. **Definire Criteri Completezza**
   ```typescript
   interface CompletenessCriteria {
     owned: {
       required: ['fleetShips', 'fuelTank', 'ammoBank', 'cargoHold'];
       optional: ['name'];
     };
     rented: {
       required: ['key']; // Minimo per rented
       optional: ['fleetShips', 'fuelTank']; // Bonus se presenti
     };
   }
   
   function calculateCompletenessScore(fleetData: any, isRented: boolean): number {
     const criteria = isRented ? completenessCriteria.rented : completenessCriteria.owned;
     const requiredCount = criteria.required.filter(field => fleetData[field]).length;
     const optionalCount = criteria.optional.filter(field => fleetData[field]).length;
     return Math.round((requiredCount / criteria.required.length) * 100 + 
                      (optionalCount / criteria.optional.length) * 20);
   }
   ```

2. **Implementare Validazione**
   - **Nuova Funzione**: `validateFleetData(fleet)` in `fleet-processor.ts`
   - **Logica**:
     ```typescript
     export function validateFleetData(fleet: any) {
       const score = calculateCompletenessScore(fleet.data, fleet.isRented);
       const isValid = score >= (fleet.isRented ? 50 : 80); // Threshold diversi
       
       return {
         isValid,
         score,
         issues: [] // Lista campi mancanti
       };
     }
     ```
   - **Integrazione**: Chiamare prima di `setCache()` e loggare risultati

3. **Strategia Cache**
   ```typescript
   // Modificare setCache call
   const validation = validateFleetData(fleet);
   await setCache('fleets', fleet.key, {
     ...fleet,
     _validation: validation,
     _cacheTime: Date.now()
   });
   
   if (!validation.isValid) {
     console.warn(`Cached incomplete fleet ${fleet.key}: score ${validation.score}`);
   }
   ```

4. **Monitoring**
   - **Endpoint**: Nuovo `/api/cache/health` per statistiche completezza
   - **Alert**: Se <70% completezza globale, log error

#### Timeline: 1-2 settimane
#### Rischi: Possibili falsi positivi nella validazione
#### Metriche: % cache entries complete, tempo medio per completare dati

### 4. UI Warning per Dati Incompleti (Priorità: Bassa)
**Problema**: Utente non consapevole di limitazioni dati rented fleets.

**Soluzione**: Mostrare avvisi nel frontend per flotte con dati incompleti.

#### Architettura Tecnica
- **Backend**: Modificare risposte API fleet
- **Frontend**: Aggiornare componenti React (ipotetico, adattare al framework usato)

#### Passi di Implementazione Dettagliati

1. **Backend API Enhancement**
   ```typescript
   // Modificare risposta in fleets.ts
   const fleetResponse = {
     ...fleet,
     dataCompleteness: {
       score: validation.score,
       level: validation.score > 80 ? 'complete' : validation.score > 50 ? 'partial' : 'minimal',
       isRented: fleet.isRented
     }
   };
   ```

2. **Frontend UI Updates**
   ```jsx
   // Esempio componente React
   function FleetItem({ fleet }) {
     const getCompletenessIcon = () => {
       if (fleet.dataCompleteness.level === 'minimal') {
         return <WarningIcon title="Dati limitati per flotta noleggiata" />;
       }
       return null;
     };
     
     return (
       <div className="fleet-item">
         {getCompletenessIcon()}
         <span>{fleet.callsign}</span>
         {fleet.isRented && <Badge variant="outline">Rented</Badge>}
       </div>
     );
   }
   ```

3. **User Education**
   - **Tooltip**: "Le flotte noleggiate possono avere dati limitati sui sub-account per restrizioni del protocollo"
   - **Help Link**: Collegamento a documentazione tecnica

4. **Testing UX**
   - **A/B Test**: Metà utenti vede warning, metà no
   - **Feedback**: Survey post-interazione

#### Timeline: 1 settimana
#### Rischi: User confusion se messaggi troppo tecnici
#### Metriche: % utenti che interagiscono con warning, feedback surveys

### 5. Monitoraggio Continuo (Priorità: Media)
**Problema**: Nessun tracking sistematico della qualità cache.

**Soluzione**: Implementare monitoraggio proattivo della completezza cache.

#### Architettura Tecnica
- **Nuovo Modulo**: `src/services/cache-monitor.ts`
- **Storage**: Database separato o file JSON per metrics
- **Alert**: Integrazione con sistema notifiche esistente

#### Passi di Implementazione Dettagliati

1. **Metriche Core**
   ```typescript
   interface CacheMetrics {
     totalFleets: number;
     completeFleets: number;
     rentedFleets: number;
     completeRentedFleets: number;
     averageCompletenessScore: number;
     timestamp: number;
   }
   
   export function calculateCacheMetrics(fleetCache: any[]): CacheMetrics {
     // Implementazione calcolo metriche
   }
   ```

2. **Alert System**
   ```typescript
   // Nuovo file: cache-alerts.ts
   export function checkCacheHealth(metrics: CacheMetrics) {
     if (metrics.averageCompletenessScore < 70) {
       sendAlert('Cache completeness below threshold', metrics);
     }
   }
   ```

3. **Dashboard Analytics**
   - **Endpoint**: `/api/cache/metrics` per dati storici
   - **Grafici**: Trend completezza ultimi 30 giorni
   - **Drill-down**: Filtrare per owned/rented

4. **Automazione**
   ```bash
   # Script giornaliero: cache-health-check.sh
   #!/bin/bash
   METRICS=$(curl -s http://localhost:3000/api/cache/metrics)
   SCORE=$(echo $METRICS | jq '.averageCompletenessScore')
   
   if (( $(echo "$SCORE < 70" | bc -l) )); then
     echo "Cache health alert: $SCORE" | mail -s "Cache Alert" admin@example.com
   fi
   ```

#### Timeline: 2 settimane
#### Rischi: Overhead monitoring, alert fatigue
#### Metriche: Tempo di rilevamento problemi, % issues risolte proattivamente

## Ottimizzazioni per Esecuzione AI

### Linee Guida Generali
- **Atomicità Task**: Ogni passo è progettato per essere indipendente e testabile
- **Input/Output Chiari**: Specificati input richiesti e output prodotti
- **Error Handling**: Ogni funzione include try/catch con logging dettagliato
- **Testing First**: Scrivere test prima dell'implementazione
- **Code Review**: Ogni modifica richiede validazione sintassi e logica

### Strumenti e Dipendenze
- **Testing**: Jest per unit test, Supertest per API testing
- **Linting**: ESLint con regole TypeScript strict
- **Build**: `npm run build` dopo ogni modifica significativa
- **Version Control**: Commit atomici con messaggi descrittivi

### Workflow AI
1. **Analisi**: Leggere documentazione esistente e codice correlato
2. **Planning**: Identificare dipendenze e ordine esecuzione
3. **Implementazione**: Scrivere codice seguendo pseudocodice fornito
4. **Testing**: Eseguire test locali e validare output
5. **Integration**: Testare integrazione con sistema esistente
6. **Documentation**: Aggiornare commenti e documentazione

### Checkpoint di Validazione
- **Dopo Ogni Task**: Eseguire `npm run build` per verificare sintassi
- **Dopo Ogni Soluzione**: Test end-to-end con dati reali
- **Prima Deployment**: Code review e testing di regressione

## Timeline Complessiva
- **Fase 1 (Settimane 1-2)**: Validazione Cache + UI Warning
- **Fase 2 (Settimane 3-5)**: Fallback Association
- **Fase 3 (Settimane 6-8)**: Migliorare Fetching Rented
- **Fase 4 (Settimane 9-10)**: Monitoraggio Continuo

## Rischi Generali e Mitigazioni

### Rischi Tecnici
- **Performance Degradation**: Monitorare latency, implementare circuit breakers
- **False Positives**: Testing estensivo con dataset reali
- **Breaking Changes**: Deployment graduale con rollback plan

### Rischi Business
- **User Experience**: Comunicare chiaramente limitazioni
- **Data Accuracy**: Validazione multi-livello associazioni
- **Scalability**: Testare con profili ad alto volume

### Mitigazioni
- Feature flags per rollout controllato
- Comprehensive testing (unit, integration, e2e)
- Monitoring e alerting proattivi
- Rollback procedures documentate

## Metriche di Successo

### KPI Primari
- **Association Accuracy**: >95% transazioni associate correttamente
- **Cache Completeness**: >90% flotte con dati completi
- **User Satisfaction**: >80% rating su handling dati incompleti

### KPI Secondari
- **Performance**: <10% degradation in response times
- **Reliability**: <1% error rate in fleet operations
- **Maintenance**: <2 ore/mese per issue cache

## Conclusioni
Questo piano dettagliato fornisce istruzioni tecniche specifiche per un'implementazione AI-driven. Ogni soluzione include pseudocodice, strutture dati, e passi atomici per garantire esecuzione precisa. L'approccio graduale con feature flags e testing estensivo minimizza rischi mentre massimizza l'impatto sulla qualità dei dati fleet.

**Budget Stimato**: 8-12 settimane sviluppo
**Team Richiesto**: 1-2 sviluppatori full-stack (o AI agent)
**Dipendenze**: Accesso documentazione SAGE, testing con profili reali</content>
<parameter name="filePath">/home/luca/Scaricati/sae-main/fleet_cache_solutions_plan.md