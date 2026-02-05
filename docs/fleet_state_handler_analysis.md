# Analisi FleetStateHandler e Integrazione nelle Ops

## Problema Identificato
Le ops "FleetStateHandler" sono state trattate come operazioni indipendenti, ma in realtà sono **operazioni intermedie** che memorizzano lo stato transitorio della flotta prima che completino operazioni più importanti (Mining, Subwarp, ecc.).

## Dati Trovati nella Cache

### Ubicazioni dei FleetStateHandler
- **sage-ops**: Contengono i dati decodificati delle operazioni
- **wallet-txs**: Contengono le transazioni complete con i log del programma

### Struttura di una Transazione con FleetStateHandler

Una transazione tipica contiene:
1. **Instruction: FleetStateHandler** (PRIMARIO - scrive stato)
2. **Program log: Current state:** Mostra lo stato effettivo (MineAsteroid, MoveSubwarp, Idle, ecc.)
3. Operazioni collaterali (ConsumeCargo, IncrementPoints, ecc.)

### Esempio da Transazione

```json
{
  "logMessages": [
    "Program log: Instruction: FleetStateHandler",
    "Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3sm..., resource: qBn..., start: 1770038872, end: 0, amount_mined: 0, last_update: 1770038872 })",
    "Program Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk invoke [2]",
    "Program log: Instruction: ConsumeCargo",
    // ... altre istruzioni
    "Program SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE success"
  ]
}
```

## Tipi di FleetStateHandler Identificati

1. **MineAsteroid** - Fleet mining su asteroide
   - Parametri: asteroid, resource, start time, amount_mined
   
2. **MoveSubwarp** - Fleet in movimento (subwarp)
   - Parametri: from_sector, to_sector, current_sector, departure_time, arrival_time, fuel_expenditure
   
3. **Idle** - Fleet inattiva
   - Parametri: sector

## Dati Aggiuntivi Disponibili nel Wallet-Tx

La transazione completa fornisce:
- `signature` - Hash della transazione
- `blockTime` - Timestamp
- `slot` - Numero del blocco
- `transaction.message.accounts` - Account coinvolti
- `transaction.message.instructions` - Tutte le istruzioni
- `meta.innerInstructions` - Istruzioni annidate
- `meta.preTokenBalances` / `postTokenBalances` - Stato delle risorse prima/dopo

### Informazioni sul Fleet ID
Dalle transazioni è possibile estrarre:
- Account della flotta (in generale nei primi account)
- Risorse consumate (fuel, cargo)
- Timestamp di inizio/fine operazione

## Strategia di Integrazione Consigliata

### Approccio 1: Consolidamento a Livello di Analisi
```
1. Per ogni FleetStateHandler trovato:
   - Leggere il wallet-tx corrispondente (match by signature)
   - Estrarre il "Current state" dal log
   - Categorizzare come: Mining, Movement, Idle
   - Associare alla flotta tramite account
   - Consolidare nel conteggio dell'operazione reale

2. Risultato finale:
   - Mining: N operazioni (non N operazioni FleetStateHandler + M Mining)
   - Movement: N operazioni (non N operazioni FleetStateHandler + M Movement)
   - FleetStateHandler: Non mostrate singolarmente
```

### Approccio 2: Lookup Inverso nella Cache
```
1. Creare mappa: signature_tx → operazione_reale
2. Per ogni FleetStateHandler:
   - Se trovato in wallet-txs: è intermedio → ignora
   - Se non trovato: potrebbe essere operazione indipendente
```

### Approccio 3: Parsing avanzato del Log
```
1. Per ogni sage-ops file che contiene "FleetStateHandler"
2. Cercare il wallet-tx con same signature
3. Leggere i logMessages
4. Estrarre il valore di "Current state"
5. Rinominare l'operazione nel database locale
6. Aggiungere metadati extra dalle transazioni
```

## File Coinvolti nell'Implementazione

### Per il Decoding:
- `src/decoders/` - Aggiungere logica di parsing state
- `src/analysis/` - Logica di consolidamento operazioni

### Per il Caching:
- Creare mapping: `operationHash → walletTxPath`
- Cache locale delle transazioni correlate

### Per il Display:
- `frontend/src/app/operationList.ts` - Filtrare FleetStateHandler
- `frontend/src/ui/renderDetails.ts` - Mostrare stato reale (non FleetStateHandler)

## Query di Test nella Cache

Cercare FleetStateHandler correlate a operazioni reali:
```bash
# Trovare FleetStateHandler
grep -r "FleetStateHandler" cache/*/wallet-txs/ | head -5

# Per ogni match, leggere il log per "Current state"
cat <file.json> | jq '.data.meta.logMessages[] | select(contains("Current state"))'
```

## Impatto Sull'Analisi

**Before**: N FleetStateHandler + M Mining = N+M operazioni (DUPLICATI)
**After**: M Mining (consolidate) = M operazioni (CORRETTO)

Rimozione stima: 20-40% riduzione conteggi gonfiati
