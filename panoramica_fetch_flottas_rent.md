# Panoramica delle Fetch sulle Flotte in Rent

## Stato Attuale (Backend SAE)

- **Fetch principali:**
  - Account `ContractState` (contratti di rental)
  - Account `RentalState` (stato del noleggio)
  - Account `Fleet` (metadati della flotta)
  - Account `fleet_ships` (composizione navi della flotta)
  - Account ship mint (per nome nave)
- **Flusso:**
  - Si parte dai contratti rental → si estraggono i pubkey delle flotte → si fetchano i dati delle flotte e delle shiplist collegate.
  - I dati estratti includono: nome flotta, composizione, starbase, fazione, e lista ship mint.
## Chiamata rental dal frontend

- La chiamata frontend `/api/rentals/contracts` accetta parametri come:
  - `profileId`, `state`, `starbase`, `minRate`, `maxRate`, `limit`, `q`
- Questi parametri permettono di filtrare i contratti rental per stato, starbase, rate, ecc.
- La risposta contiene un array di oggetti `RentalContract` con i dati base e opzionalmente alcuni dettagli estratti dalla fleet.
- Attualmente i dettagli avanzati (fuel, cargo, crew, ecc.) non sono fetchati né restituiti.

## Proposta: fetch opzionali tramite parametri API


curl -s 'http://localhost:3000/api/rentals/contracts?limit=1' | jq .
Si possono aggiungere parametri opzionali alla chiamata `/api/rentals/contracts` 
----- INCLUDE FUEL

  - `includeFuel=true` → fetch e decodifica fuel tank
  - `includeCargo=true` → fetch e decodifica cargo hold
  - `includeAmmo=true` → fetch e decodifica ammo bank
  - `includeCrew=true` → fetch e decodifica crew
  - `includeAllDetails=true` → fetcha tutto il possibile

Se nessun parametro è specificato, la chiamata restituisce solo i dati base dei ContractState (contratti rental), lasciando la risposta "pulita" e minimale.

Il backend, in base a questi parametri, esegue le fetch richieste e arricchisce la risposta con i dati decodificati corrispondenti.
I campi aggiuntivi vengono inseriti nell'oggetto `RentalContract` solo se richiesti.
Questo approccio mantiene la compatibilità e permette al frontend di scegliere il livello di dettaglio desiderato, ottimizzando le performance e la quantità di dati trasferiti.

---
  
## Cosa fa la repo ufficiale (star-atlas-decoders-main)
  - I decoder (es. `srsly-decoder`, `sage-starbased-decoder`, `crew-decoder`, `cargo-decoder`) permettono di decodificare vari tipi di account: Fleet, Cargo, Crew, ecc.
  - Gli script Rust (es. `get_fleet_state.rs`, `decode_fleets.rs`) mostrano come, dato un fleet id, sia possibile fetchare e decodificare anche altri account collegati (cargo, fuel, crew, ecc.).
- **Struttura dati:**
  - Le struct Fleet, Cargo, Crew, ecc. sono separate e richiedono fetch dedicate per ogni pubkey.
  - I decoder Rust supportano la decodifica di tutti questi tipi di account.

## Fetch Aggiuntive Possibili

Per arricchire i dati delle flotte in rent, si possono aggiungere fetch per:

- **Fuel Tank:**
  - Pubkey disponibile nel dato decodificato della flotta (campo `fuel_tank` o simile)
  - Fetch account per stato carburante
- **Cargo Hold:**
  - Pubkey disponibile (campo `cargo_hold`)
  - Fetch account per stato cargo
- **Ammo Bank:**
  - Pubkey disponibile (campo `ammo_bank`)
  - Fetch account per munizioni
- **Crew:**
  - Pubkey disponibile (campo `crew` o simile, se presente)
  - Fetch account per stato crew
- **Altri moduli:**
  - Qualsiasi altro pubkey referenziato nella struct Fleet (es. moduli, upgrade, ecc.)

## Confronto e Best Practice

- **Attuale:**
  - Si fetchano solo i dati minimi (contratto, rental, fleet, shiplist, ship mint)
- **Repo ufficiale:**
  - Supporta la decodifica di tutti gli account collegati, ma richiede fetch esplicite per ogni pubkey
- **Suggerimento:**
  - Dopo aver decodificato la Fleet, estrarre tutti i pubkey collegati (fuel, cargo, ammo, crew, ecc.) e fetchare anche questi account
  - Decodificare i buffer usando i decoder Rust/TS già presenti
  - Così si ottengono tutti i dettagli disponibili senza parsing dei log

## Esempio di fetch aggiuntive (pseudo-flusso)

1. Fetch ContractState → estrai fleet pubkey
2. Fetch Fleet → estrai pubkey: fleet_ships, fuel_tank, cargo_hold, ammo_bank, crew, ecc.
3. Fetch ciascun account collegato
4. Decodifica ogni buffer con il decoder appropriato

---

**Risultato:**
Con queste fetch aggiuntive, puoi ottenere tutti i dati strutturati disponibili on-chain per ogni flotta in rent, in linea con quanto supportato dalla repo ufficiale Star Atlas Decoders.
