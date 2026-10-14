# SDU Program: analisi e piano

## Obiettivo e perimetro

Unificare la selezione della destinazione di `macrov9.1.py` e l'esecuzione scan di Sly, eliminando il passaggio manuale di JSON via clipboard.

- La selezione della cella/area resta quella della macro: stessa richiesta e stessa risposta dell'API `/api/scan-filter`.
- L'API è trattata come black box: il suo server non è stato letto né va modificato in questo lavoro.
- Da Sly si riusa solo la scansione semplice alla coordinata ricevuta, con le sue guardie di fuel, movimento e rientro/rifornimento alla SB.
- Non portare `readScanMap`, `scanTargetStillValid`, `handleScanAutoMovement`, pattern, cluster scoring o bypass: la scelta della destinazione appartiene all'API della macro.
- Non mantenere il flusso di automazione UI/clipboard che apre l'import Sly e incolla il JSON.

## Comportamento osservato

### Macro: trigger e selezione

In `macrov9.1.py`:

1. `main_loop` legge periodicamente lo status di Sage tramite coordinate UI, seleziona e copia il testo con Ctrl+A/C, poi estrae coordinate correnti e fuel.
2. `stato_pronto_per_trigger` applica parole chiave di scanned/timeout e un cooldown locale; una scansione nuova parte solo quando lo status è pronto.
3. `parametri_scanner` costruisce il payload per `/api/scan-filter`: fleet name/ID, posizione, starbase, doppia SB, pesi, range, fuel/food, flag di scoring, `reset_counts` e `requestType` (`cell` o `area`).
4. Con `doubleSB`, ordina le due SB per distanza dalla posizione corrente. Se il fuel attraversa verso il basso `fuel_minimo`, imposta una richiesta `area`; anche `pause_strike` può promuovere la richiesta da cella ad area al raggiungimento della soglia.
5. La risposta attesa include `x`, `y` e può includere `sb`, `%`, `coeff`. Le coordinate diventano la destinazione da eseguire.
6. Il percorso legacy converte la risposta in un'assegnazione Sly `Scan` e la importa via clipboard/click. È il ponte da rimuovere, non una logica da replicare.

Il toggle di simulazione locale genera una risposta deterministica per test offline: va mantenuto separato dalla modalità live e non deve poter essere scambiato per una selezione API reale.

### Sly: esecuzione alla destinazione

Da `SLY_7.36mio.js.md` e `SLY_KNOWLEDGE_INDEX.md`:

- `execScan` risolve il settore, lo scopre se manca, poi invia `scanForSurveyDataUnits` tramite Anchor/SAGE.
- `handleScan` verifica food/capienza cargo, calcola il costo del viaggio verso la destinazione e del ritorno alla SB, legge il fuel del fuel tank e si muove solo se il budget è sufficiente.
- `handleMovement` conserva le scelte di movimento e i passaggi Warp/Subwarp, inclusi cooldown warp, waypoint e aggiornamento dello stato on-chain.
- `handleResupply` rientra alla SB, scarica gli SDU lasciandone uno, carica food quando la scan lo richiede, riempie il fuel tank, verifica/crea le PDA scanner e undocka.
- Lo stato di scan/cooldown, il risultato della transazione, SDU/food e fuel sono aggiornati dopo l'operazione.
- Le velocità SAGE sono interi scalati: Sly usa `subwarpSpeed / 1e6` per il movimento. Il valore UI equivalente è quindi `movement_stats.subwarp_speed / 1e6`; il range consigliato della macro è `ceil(cooldown * subwarp_speed * 10) / 10`.

## Contratto API da preservare

La nuova UI deve mantenere i nomi e la semantica del payload prodotto da `parametri_scanner`; non rinominare campi né reinterpretare i coefficienti senza un contratto/API di riferimento:

- Identità: `nomeFlotta`, `idFlotta`.
- Posizione e basi: `currentCoords`, `sbCoords`, `primaSB`, `secondaSB`, `doubleSB` (le ultime tre secondo il comportamento attuale della macro).
- Selezione: `count`, `sdu`, `growing`, `scanCooldown`, `rangeSB`, `smartRange`, `maxareaFromFleet`, `maxdistanceFromFleet1`, `coeffcount1`, `coeffsdu1`, `coeffgrowing1`.
- Risorse e trigger: `fuel`, `fuel_min`, `fuel_range_min`, `fuel_max`, `food`, `food_min`, `reset_counts`, `requestType`.
- Trasporto: `POST {payload}` a `http://<host>:<port>/api/scan-filter`, timeout configurabile; risposta con coordinate `x/y` e metadati opzionali `sb/%/coeff`.

La logica interna del server di selezione resta fuori perimetro. Prima dell'implementazione servono fixture ottenute dal client macro per richieste `cell`, `area`, `doubleSB`, errori/timeout e risposta senza `sb`.

## Piano di implementazione

### Fase 1: configurazione e stato flotta

- Riutilizzare la finestra Automation esistente e i parametri di `macrov9.1.py`; distinguere configurazione editabile da dati letti on-chain.
- Popolare fleet ID/nome, posizione, capacità e statistiche dal feed; aggiungere la lettura dei saldi SPL necessari per fuel, food, cargo e SDU.
- Derivare la velocità in unità Sly (`raw / 1e6`) e il range consigliato dal cooldown; non codificare valori per una flotta campione.
- Persistenza per flotta e import/export dei parametri da definire prima di portare l'intero set di impostazioni.

### Fase 2: replica della selezione macro

- Implementare lo stesso trigger scanned/cooldown, `pause_strike`, soglia minima e `force_area_next` al rientro/variazione fuel.
- Costruire il payload con la stessa normalizzazione coordinate e ordinamento delle due SB; chiamare l'API configurata.
- Validare risposta e coordinate prima di usarle; registrare richiesta, risposta, motivo `cell/area`, fuel e decisione.
- Conservare simulazione offline come modalità esplicita; non usarla silenziosamente quando l'API live fallisce.

### Fase 3: esecuzione Sly minimale

- Usare la coordinata API come unico target del ciclo; usare `sb` della risposta se presente, altrimenti applicare il fallback attuale della macro.
- Portare i soli primitive necessari: fetch/refresh account, guardie food/cargo/fuel, stima andata-ritorno secondo il movement type, movement Warp/Subwarp, `discoverSector` se necessario e `scanForSurveyDataUnits`.
- Se la guardia fuel non consente il ciclo, instradare alla SB e fare il resupply Sly; dopo il rifornimento rileggere chain state e risorse prima di riprendere.
- Conservare cooldown e stato per flotta così refresh/errori RPC non generano scansioni duplicate né perdono il target attivo.

### Fase 4: sicurezza e verifica

- Separare chiaramente test/simulazione da mainnet live; nessuna chiave privata in config o backend.
- Costruire le istruzioni nel browser e firmarle tramite il wallet browser collegato, come Sly (`signAllTransactions`); il backend non custodisce chiavi e non firma. Non portare il `customKeypair` opzionale di Sly.
- Prima della firma simulare le istruzioni e mostrare cluster, flotta, coordinate, movimento, costo stimato e fee. L'automazione parte solo dopo connessione e opt-in esplicito dell'utente; rispettare la conferma richiesta dal wallet.
- Confrontare con fixture legacy: payload API byte/semantica invariati, scelta cell/area, doppia SB, fuel sotto soglia, API down, fuel insufficiente, rientro, rifornimento, scan e cooldown.
- Provare prima senza invio (mock/simulazione), poi su ambiente controllato; nessuna transazione mainnet durante la fase di studio.

## Decisioni e rischi aperti

- **Unità API e valori**: confermare con fixture quali input numerici il server interpreta come stringhe/numeri e il significato esatto di `rangeSB`, `fuel_range_min` e `reset_counts`.
- **Fuel**: mantenere come guardia operativa il calcolo Sly basato su saldi chain e movement type; la stima percentuale client della macro non deve sostituirlo né sovrascriverlo.
- **Doppia SB**: confermare quale SB usare per rifornimento quando la risposta API non specifica `sb` e come aggiornare la base dopo un rientro.
- **Wallet browser**: riusare il wallet già collegato nell'app, oppure richiedere la connessione dalla pagina SEA; verificare che il profilo e le permission SAGE corrispondano alla flotta selezionata.
- **Disponibilità dati**: lo snapshot SEA attuale espone dati account/flotta, ma non i saldi SPL aggiornati necessari alle decisioni di fuel e cargo.

## Riferimenti analizzati

- [Macro `macrov9.1.py`](../../sly/macrov9.1.py): trigger, stato, payload, API, guardie, fallback clipboard/on-chain e configurazione.
- [SLY knowledge index](../../sly/SLY_KNOWLEDGE_INDEX.md): mappa di `handleScan`, `handleMovement`, `handleResupply`, calcolo fuel e primitive `execScan`.
- [SLY estratti indicizzati](../../sly/SLY_7.36mio.js.md): implementazioni delle primitive di scan/movement/resupply; auto-movement e scan-map sono consultati solo per escluderli dal port.
