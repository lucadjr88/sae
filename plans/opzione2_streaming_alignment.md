# Piano attuazione Opzione 2 (allineare streaming a detailed)

## Sequenza operativa (riduci contesto disperso)
1) Backend streaming – mapping e bucket
	- File: `src/services/walletSageFeesStreaming/index.ts`.
	- Copia la logica di `debug.ts`: prima `extractFleetFromInstruction`, se manca usa `accountToFleetMap`, se nulla → bucket `Crafting Operations` se `/craft/i` su op/type/programId`, altrimenti `Other Operations`.
	- Aggrega opNames come debug (count/totalFee/avgFee); non usare raw instructions come chiave.
	- Non toccare SSE/progress né struttura response.

2) Inizializzazione flotte coerente
	- Con `accountToFleetMap` (fleet, fleetShips, fuel, ammo, cargo) crea subito `feesByFleet[fleetKey]` con fee/ops 0 e isRented.
	- Dopo l’aggregazione raccogli `allOpNames` e aggiungi op mancanti (count/fee 0) a tutte le fleet note per allineare le tabelle.

3) Frontend: stabilità lista
	- File: `public/js/results-display.js`: nel padding `completeFeesByFleet` aggiungi sia `f.key` sia `f.data.fleetShips` a fee 0.
	- Mantieni filtri attuali che escludono bucket non-fleet in `results-display` e `fleet-operations`.

4) Test rapidi (ordine esecuzione)
	- POST `/api/wallet-sage-fees-stream` con payload `/tmp/req.json`: atteso Dunnar Fleet presente con fee 0, nessuna op spurie.
	- Confronta output con `/api/wallet-sage-fees-detailed`: set flotte e fee totali devono combaciare (arrotondamenti ammessi).
	- UI: Fleet Breakdown mostra tutte le fleet note (incl. Dunnar a 0) senza bucket non-fleet; pie chart top5 non include Dunnar se fee 0.
	- Confronta `feesByOperation` top N tra stream e detailed (differenze solo di rounding).

5) Regressioni da controllare
	- SSE/progress invariati.
	- Niente duplicazioni op/fee in Crafting/Other.
	- Sorting fleeti stabile (rented first, poi fee desc).
	- Bucket non-fleet esclusi da Fleet Breakdown; filtri attivi in `createFleetList` e `displayPartialResults`.
	- Ops `count=0` non impattano percentuali (evita div/0 nei componenti front).

6) Validazioni mirate
	- Batch crafting: tutte le tx devono finire in `Crafting Operations`, non su fleet reali.
	- Tx senza match fleet: vanno in `Other Operations` solo, nessun leak su fleet.
	- Per ogni fleet: somma `operations.*.totalFee` ≈ `fleet.totalFee` (tolleranza lamport minimi).