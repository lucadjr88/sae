# Matrice di Test – Associazione Operazioni Rainbow Cargo

## Strategia di verifica


### Strategia aggiornata con API e cache

1. **Preparazione ambiente**
	- Esegui wipe della cache tramite `POST /api/cache/wipe` per test puliti.
	- Usa `refresh: true` nelle API di fees per forzare il ricalcolo e non dipendere da dati precedenti.

2. **Test di associazione operazioni**
	- Per ogni tipo di operazione (subwarp, mining, cargo, fuel, ammo, ecc.), simula una transazione con uno degli account mappati (fleetKey, cargoHold, fuelTank, ammoBank).
	- Verifica l’associazione tramite:
	  - `POST /api/wallet-sage-fees-detailed` per breakdown legacy.
	  - `POST /api/debug/fleet-breakdown` per struttura raw e dettagliata, inclusi tutti i sub-account e il campo `operations`.
	  - `POST /api/debug/transaction-fleet-mapping` per analisi puntuale di una singola transazione.
	- Annotare input, output atteso, output effettivo e note su warning/bug.

3. **Validazione mapping e warning**
	- Usa `POST /api/debug/fleet-association-check` per validare la correttezza del mapping tra account e flotte.
	- Evidenzia warning come flotta fantasma e multi-flotta.

4. **Analisi breakdown**
	- Confronta il campo `operations` restituito da `/api/debug/fleet-breakdown` per ogni account mappato.
	- Verifica che tutte le operazioni siano correttamente associate e che non ci siano breakdown vuoti per account mappati.

5. **Iterazione e ripetizione**
	- Ripeti i test dopo ogni modifica alla logica di mapping o ai parametri di chiamata.
	- Aggiorna la matrice di test con i risultati delle nuove API.

---

### Nuove API utili per la matrice

- `/api/debug/fleet-breakdown`: restituisce la struttura raw `feesByFleet` con breakdown dettagliato per tutti gli account (fleetKey e sub-account).
- `/api/debug/transaction-fleet-mapping`: analizza l’associazione per una singola transazione.
- `/api/debug/fleet-association-check`: verifica la correttezza del mapping tra account e flotte.
- `/api/cache/wipe`: permette di azzerare la cache per test puliti.

---

### Raccomandazioni operative

- Esegui sempre wipe della cache prima di test critici.
- Usa le API di debug per validare sia la logica di mapping che il breakdown effettivo.
- Documenta ogni test case con input, output atteso, output effettivo e note su warning/bug.

---

## Matrice di test

| Test case                                              | Account coinvolto         | Atteso                                 | Risultato dopo fix           |
|--------------------------------------------------------|--------------------------|----------------------------------------|------------------------------|
| Dock con fleetKey Rainbow Cargo                        | fleetKey                 | Associazione a Rainbow Cargo           | ✓ (OK)                       |
| Dock con cargoHold Rainbow Cargo                       | cargoHold                | Associazione a Rainbow Cargo           | ✓ (OK)                       |
| Dock con fuelTank Rainbow Cargo                        | fuelTank                 | Associazione a Rainbow Cargo           | ✓ (OK)                       |
| Dock con ammoBank Rainbow Cargo                        | ammoBank                 | Associazione a Rainbow Cargo           | ✓ (OK)                       |
| Operazione con account non mappati                     | altro                    | Warning flotta fantasma                | ✓ (OK)                       |
| Operazione con più account di flotte diverse           | fleetKey + altro         | Warning multi-flotta                   | ✓ (OK)                       |
| Combinazioni varie (matrice combinatoria)              | cargoHold + fuelTank     | Associazione o warning secondo regole  | ✓ (OK)                       |

---

## Osservazioni
- Tutte le operazioni con account mappati (fleetKey, cargoHold, fuelTank, ammoBank) vengono ora associate correttamente.
- La logica di mapping è ora estesa a tutti gli account mappati.
- Warning flotta fantasma e multi-flotta continuano a funzionare correttamente.

---

## Prossimi step
- Analizzare la funzione di associazione per estendere il match a tutti gli account mappati.
- Aggiornare la logica di mapping e ripetere i test.

---

*File generato automaticamente secondo strategia di debug.*
