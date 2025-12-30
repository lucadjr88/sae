# Strategia robusta per aggregazione feesByFleet e operazioni normalizzate

## Obiettivo
Garantire che ogni fleet reale (inclusi sub-account, cargo, mining, ecc.) abbia sempre una propria chiave in `feesByFleet`, con tutte le operazioni normalizzate correttamente aggregate, per ogni wallet/account.

---

## Step dettagliati

### 1. Inizializzazione fleet
- Inizializzare SEMPRE tutte le fleet reali in `feesByFleet` usando la lista `fleetAccounts` fornita in input.
- Ogni fleet deve avere almeno la struttura base:
  ```js
  feesByFleet[fleetKey] = {
    totalFee: 0,
    feePercentage: 0,
    totalOperations: 0,
    isRented: !!fleetRentalStatus[fleetKey],
    operations: {},
    fleetName: fleetNames[fleetKey] || fleetKey.substring(0,8)
  }
  ```

### 2. Mapping completo transazioni → fleet
- Per ogni transazione, estrarre tutti gli accountKeys coinvolti.
- Usare una mappa `accountToFleetMap` che collega ogni sub-account (cargoHold, mining, fuelTank, ecc.) alla fleet principale.
- Se una transazione coinvolge più fleet (es. multi-account), associarla a tutte le fleet corrispondenti.
- Se nessun match, aggregare solo in "Other Operations".

### 3. Aggregazione operazioni normalizzate
- Per ogni transazione, estrarre tutte le operazioni normalizzate (array o singola stringa).
- Per ogni fleet associata, incrementare i contatori e aggregare le fee per OGNI operazione normalizzata.
- Se una fleet non ha una certa operazione, aggiungere la chiave con count 0 (per coerenza UI/API).

### 4. Coerenza e fallback
- Anche se una fleet ha 0 transazioni, la chiave deve esistere in `feesByFleet` (con operations vuoto).
- "All Fleets" deve essere solo un aggregato globale, mai l'unica chiave.
- "Other Operations" raccoglie solo tx non associabili a nessuna fleet reale.

### 5. Validazione e test
- Testare con wallet che hanno solo sub-account, solo mining, solo cargo, solo subwarp, e combinazioni miste.
- Validare che il frontend mostri sempre tutte le op normalizzate per ogni fleet reale.
- Validare che nessuna fleet reale manchi da `feesByFleet`.

---

## Vantaggi
- Nessuna informazione persa: ogni fleet reale ha sempre la sua chiave e tutte le sue operazioni.
- UI e API sempre coerenti, anche per wallet edge-case.
- Facilità di debug e manutenzione.

---

## TODO
- Implementare mapping robusto account→fleet.
- Refactor pipeline di aggregazione.
- Validare con test reali e edge-case.
