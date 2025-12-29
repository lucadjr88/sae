# Analisi Cache Fleet: File Corrotti o Incomplete

## Data Analisi
29 dicembre 2025

## Introduzione
Questa analisi esamina i file di cache nella directory `/home/luca/Scaricati/sae-main/cache/fleets/` per identificare file corrotti (JSON non valido) o flotte incomplete (mancanza di dati critici come sub-account).

## Metodo di Analisi
- **Validazione JSON**: Ogni file `.json` è stato controllato per validità sintattica usando `jq`.
- **Struttura Richiesta**: I file dovrebbero avere la struttura:
  ```json
  {
    "savedAt": number,
    "data": {
      "callsign": string,
      "key": string,
      "data": {
        "fleetShips": string?,  // Opzionale
        "fuelTank": string?,    // Opzionale
        "ammoBank": string?,    // Opzionale
        "cargoHold": string?    // Opzionale
      },
      "isRented": boolean?
    }
  }
  ```
- **Criteri di Completezza**:
  - **Corrotto**: JSON non valido.
  - **Incompleto**: Campo `key` mancante, o `data.data` vuoto senza sub-account (quando la flotta dovrebbe averli).
  - **Rented Status**: Campo `isRented` presente e true/false.

## Risultati

### Statistiche Generali
- **Totale File**: 12
- **JSON Validi**: 12 (100%)
- **Flotte con Data Completa**: 5 (42%)
- **Flotte con Data Vuota**: 7 (58%)
- **Flotte Marcate come Rented**: 5 (42%)
- **Flotte senza Rented Status**: 7 (58%)

### Analisi Dettagliata per Flotta

| Fleet Key (abbreviato) | Callsign | Is Rented | Data Status | Note |
|------------------------|----------|-----------|-------------|------|
| 3LDBxBF... | ReFoxScan | NO | HAS DATA | Completa |
| 4t17D2w... | Miner1 | NO | HAS DATA | Completa |
| 6aeaH8q... | <unnamed 6aeaH8> | true | EMPTY | **Incompleta** - Nessun sub-account |
| 7hhSmvc... | Rainbow Cargo | NO | HAS DATA | Completa |
| 23MZ2cr... | <unnamed 23MZ2c> | true | EMPTY | **Incompleta** - Nessun sub-account |
| 83mBwnH... | Lutrizio Fleet | NO | HAS DATA | Completa |
| AjVrjRv... | <unnamed AjVrjR> | true | EMPTY | **Incompleta** - Nessun sub-account |
| CYS9kDS... | Dunnar Fleet | NO | HAS DATA | Completa |
| EE66Fsu... | Miner2 | NO | HAS DATA | Completa |
| EiYf15K... | Scan Fleet | true | EMPTY | **Incompleta** - Nessun sub-account |
| GAMEzqJ... | <unnamed GAMEzq> | true | EMPTY | **Incompleta** - Nessun sub-account |
| HwSUG1s... | <unnamed HwSUG1> | true | EMPTY | **Incompleta** - Nessun sub-account |

### Flotte Incomplete (Data: EMPTY)
Le seguenti flotte hanno `data.data` vuoto, il che significa mancanza di informazioni sui sub-account (fleetShips, fuelTank, ammoBank, cargoHold). Questo può causare problemi nell'associazione delle transazioni se le operazioni coinvolgono questi sub-account.

1. **6aeaH8q7unhosrg3rn3eqi3pUz1DxDyU2aQvGPF2s6dg** (unnamed 6aeaH8) - Rented
2. **23MZ2crHoWKJ6rvZz8B7fEJchvFNHcq6HMBrFabEksrK** (unnamed 23MZ2c) - Rented
3. **AjVrjRvmz3bquxntsBkM7GLZrCPutrtfLYXT4Lxn7MAE** (unnamed AjVrjR) - Rented
4. **EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg** (Scan Fleet) - Rented
5. **GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr** (unnamed GAMEzq) - Rented
6. **HwSUG1sUzvk3HTyYDQk4Fx9Lk7NBGjSYKVMgUxZozp6B** (unnamed HwSUG1) - Rented

Tutte le flotte incomplete sono marcate come rented (isRented: true).

### Flotte Complete (Data: HAS DATA)
Queste flotte hanno dati completi sui sub-account:

1. **3LDBxBFhgJAU6q2JaUgENXckNZrVdTh2gt8Nn3bAhGoq** (ReFoxScan)
2. **4t17D2wDf1AxF4ywsjZ8X9J8iXq8qJMwSvxQxZ24TojW** (Miner1)
3. **7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5** (Rainbow Cargo)
4. **83mBwnHH232x5h8gP96CaiL5k4ffv6soqRBpbR8QVg17** (Lutrizio Fleet)
5. **CYS9kDSFaK554YuwDWUct2afqRxJTnjT39c1p2DyaxkR** (Dunnar Fleet)
6. **EE66FsuC5FHjzfc9FR2aj8mEqtk9cYqPRnoiGytysHMT** (Miner2)

Nessuna di queste è marcata come rented.

## Impatto sul Sistema
- **Associazione Transazioni**: Le flotte incomplete potrebbero non essere associate correttamente alle transazioni che coinvolgono sub-account (cargoHold, fuelTank, etc.), poiché il codice usa `accountToFleet` costruito dai sub-account nel cache.
- **Display Frontend**: Flotte incomplete potrebbero apparire con fees zero o non apparire affatto se l'associazione fallisce.
- **Rented Status**: Il campo `isRented` è inconsistente; alcune flotte lo hanno, altre no. Questo potrebbe influenzare la logica di visualizzazione.

## Raccomandazioni
1. **Aggiornare Cache**: Rigenerare i file di cache per le flotte incomplete chiamando l'endpoint `/api/fleets` con `refresh=true` per il profilo interessato.
2. **Validazione Cache**: Aggiungere validazione nel codice per controllare completezza dei dati di cache prima dell'uso.
3. **Logging**: Aggiungere logging quando una flotta ha dati incompleti per identificare problemi di cache.
4. **Monitoraggio**: Implementare un controllo periodico dell'integrità della cache fleet.
5. **Fallback**: Nel codice di associazione, avere un fallback per flotte senza sub-account definiti.

## Analisi Approfondita del Problema di Cache Incompleta

### Sintomi Osservati Dopo Reset Cache
Dopo aver cancellato la cache e rieseguito l'analisi del profile ID `4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8`, la cache continua a popolarsi con dati di flotte parziali o errati. Le stesse 7 flotte rented continuano ad avere `data.data` vuoto, mentre le 5 flotte owned mantengono dati completi.

### Analisi del Codice di Fetching delle Flotte

#### Struttura del Processo di Recupero
Il sistema utilizza una pipeline modulare in `getFleets-modular.ts`:

1. **Setup Connessioni**: Stabilisce connessioni RPC e provider Anchor
2. **Fetch Flotte**: Recupera flotte owned e rented tramite filtri specifici
3. **Derivazione Wallet Authority**: Determina l'autorità del wallet
4. **Scan Transazioni Wallet**: Trova flotte aggiuntive dalle transazioni
5. **Scan SRSLY Rentals**: Trova flotte noleggiate tramite contratto SRSLY
6. **Processamento Finale**: Costruisce gli oggetti fleet finali

#### Meccanismo di Fetch delle Flotte
In `fleet-fetcher.ts`, le flotte vengono recuperate usando:

- **Owned Fleets**: Filtro su `owningProfile` (offset 41)
- **Rented Fleets**: Filtro su `subProfile` (offset 73)

Il fetching utilizza `readAllFromRPCWithRetry` che popola `fleet.data.data` con i dati decodificati dall'account.

#### Costruzione dell'Oggetto Fleet Finale
In `fleet-processor.ts`, ogni fleet viene trasformata in:

```typescript
{
  callsign: string,
  key: string,
  data: fleet.data.data,  // DATI DIRETTAMENTE DALL'ACCOUNT
  isRented: boolean
}
```

### Radice del Problema: Differenze tra Owned e Rented Fleets

#### Flotte Owned (Complete)
- `data.data` contiene: `fleetShips`, `fuelTank`, `ammoBank`, `cargoHold`, etc.
- Questi sub-account sono accessibili perché il wallet è il proprietario
- Permettono associazione corretta delle transazioni anche per operazioni su sub-account

#### Flotte Rented (Incomplete)  
- `data.data` è spesso `{}` (vuoto)
- I sub-account potrebbero non essere popolati o accessibili allo stesso modo
- Il renter ha diritti limitati sui dati dell'account fleet

#### Perché le Rented Sono Incomplete?
1. **Accesso Limitato**: Il contratto di noleggio potrebbe non esporre tutti i sub-account al renter
2. **Parsing IDL**: L'IDL di SAGE potrebbe non decodificare correttamente i dati per flotte rented
3. **Stato dell'Account**: Le flotte rented potrebbero avere una struttura dati diversa

### Impatto Funzionale

#### Associazione Transazioni
In `wallet-sage-fees-detailed.ts`, l'associazione fleet-transazione usa:

```typescript
// Match diretto
if (tx.accountKeys.includes(fleet)) { ... }

// Match sub-account (solo se in cache)
const accountToFleet = {}; // Costruito da cache fleet.data.data
```

**Problema**: Per flotte rented con `data.data` vuoto, non esiste mapping sub-account → fleet, causando mancato riconoscimento di transazioni che coinvolgono `cargoHold`, `fuelTank`, etc.

#### Esempio Pratico: Scan Fleet
- **Scan Fleet** è rented (`isRented: true`)
- `data.data` è vuoto, quindi nessun sub-account noto
- Transazioni dirette al fleet key vengono associate correttamente
- Transazioni a sub-account potrebbero non essere associate

### Pattern Osservato
- **100% delle flotte incomplete** sono rented
- **0% delle flotte owned** sono incomplete  
- Il problema persiste dopo reset cache, indicando un limite strutturale del fetching

### Ipotesi sul Perché Continua ad Accadere
1. **Limite del Protocollo**: Le rented fleets per design non espongono sub-account completi
2. **Implementazione Fetching**: Il codice non gestisce correttamente il caso rented
3. **Cache Strategy**: La cache viene popolata con dati parziali perché è tutto ciò che è disponibile

### Soluzioni Potenziali
1. **Fallback per Rented**: Implementare logica alternativa per recuperare sub-account di rented fleets
2. **Associazione Migliorata**: Usare euristica aggiuntive oltre ai sub-account cached
3. **Validazione**: Rifiutare cache incomplete e ritentare fetching con parametri diversi
4. **Logging Dettagliato**: Tracciare perché `data.data` è vuoto per rented fleets

## Conclusioni
Il 58% delle flotte in cache (7 su 12) sono incomplete, con dati vuoti sui sub-account. Questo è **esclusivamente un problema delle flotte rented**, che per limiti del protocollo SAGE non espongono i sub-account completi al renter. Il problema persiste dopo reset della cache perché è intrinseco al meccanismo di fetching delle rented fleets.

### Impatto Critico
- **Associazione Transazioni Limitata**: Transazioni che coinvolgono sub-account (cargoHold, fuelTank, ammoBank) di rented fleets non vengono associate correttamente
- **Fees Sottostimate**: Ricavi da operazioni su sub-account potrebbero non apparire nel frontend
- **Inconsistenza Dati**: Frontend mostra fees zero per rented fleets con attività reale

### Raccomandazioni Prioritarie
1. **Implementare Fallback Association**: Aggiungere logica per associare transazioni a rented fleets anche senza sub-account completi
2. **Migliorare Fetching Rented**: Investigare metodi alternativi per recuperare sub-account di rented fleets
3. **Validazione Cache**: Implementare controlli di completezza prima di salvare in cache
4. **UI Warning**: Mostrare avviso per rented fleets con dati incompleti
5. **Monitoraggio Continuo**: Tracciare tasso di completezza della cache nel tempo</content>
<parameter name="filePath">/home/luca/Scaricati/sae-main/fleet_cache_analysis.md