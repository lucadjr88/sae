# SDU Program: analisi e piano

## Obiettivo e perimetro

Unificare la selezione della destinazione di `macrov9.1.py` e l'esecuzione scan di Sly, eliminando il passaggio manuale di JSON via clipboard.

- La selezione della cella/area resta quella della macro: stessa richiesta e stessa risposta dell'API `/api/scan-filter`.
- L'API è trattata come black box: il suo server non è stato letto né va modificato in questo lavoro.
- Da Sly si riusa solo la scansione semplice alla coordinata ricevuta, con le sue guardie di fuel, movimento e rientro/rifornimento alla SB.
- Non portare `readScanMap`, `scanTargetStillValid`, `handleScanAutoMovement`, pattern, cluster scoring o bypass: la scelta della destinazione appartiene all'API della macro.
- Non mantenere il flusso di automazione UI/clipboard che apre l'import Sly e incolla il JSON.

## Principi architetturali

- Sea resta un modulo indipendente dentro SAE: possiede la logica di dominio, lo stato del ciclo e l'interfaccia della propria automazione. Non dipende direttamente da dettagli interni o regole di business generiche di SAE.
- Sea può riusare infrastruttura SAE già disponibile, in particolare cache, lettura chain/RPC, wallet e preparazione/inoltro transazioni. L'accesso avviene tramite contratti espliciti; gli adattatori SAE implementano tali contratti senza trasferire a SAE le decisioni operative di Sea.
- La direzione delle dipendenze è dal dominio Sea verso interfacce stabili e dagli adattatori verso i servizi SAE. Non duplicare infrastruttura per ottenere isolamento e non accoppiare le regole Sea a implementazioni condivise.
- La fedeltà a Sly riguarda le guardie e la sequenza operativa necessarie al ciclo scan, movimento e resupply. Si portano solo le primitive necessarie; non si importa Sly né si replica la sua logica di selezione destinazioni, esclusa dal perimetro.
- Modularizzare per responsabilità e contratti, non per moltiplicare i file. Ogni modulo deve avere input/output e stato posseduto riconoscibili, così modifiche e analisi AI possono concentrarsi su un'unità coerente senza attraversare UI, chain e policy insieme.

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
- Posizione e basi: `currentCoords`, `sbCoords`, `primaSB`, `secondaSB`. `doubleSB` è solo un flag UI: determina se valorizzare/ordinare le due basi, ma non viene inviato nel payload.
- Selezione: `count`, `sdu`, `growing`, `scanCooldown`, `rangeSB`, `smartRange`, `maxareaFromFleet`, `maxdistanceFromFleet1`, `coeffcount1`, `coeffsdu1`, `coeffgrowing1`.
- Risorse e trigger: `fuel`, `fuel_min`, `fuel_range_min`, `fuel_max`, `food`, `food_min`, `reset_counts`, `requestType`.
- Trasporto: `POST {payload}` a `http://<host>:<port>/api/scan-filter`, timeout configurabile; risposta con coordinate `x/y` e metadati opzionali `sb/%/coeff`.

La logica interna del server di selezione resta fuori perimetro. Prima dell'implementazione servono fixture ottenute dal client macro per richieste `cell`, `area`, `doubleSB`, errori/timeout e risposta senza `sb`.

## Piano di implementazione

### Stato attuale: selezione senza transazioni

- `GET /api/sea/fleet-resources` legge on-demand fuel e food dai token account della flotta, usando i mint dell'account Game e verificando che la flotta appartenga al profilo richiesto.
- `frontend/src/sea/automation/scanFilter.js` costruisce il payload legacy, normalizza coordinate, ordina `primaSB`/`secondaSB` solo con `doubleSB`, simula localmente o richiede la destinazione all'API.
- Le richieste live passano da `POST /api/sea/scan-filter` same-origin; SAE inoltra il payload senza modificare la logica upstream. Il relay accetta solo loopback e IPv4 RFC1918.
- `POST /api/sea/scan/prepare` risolve il key index wallet con scope SAGE, richiede settore e account scanner già esistenti e simula la sola `scanForSurveyDataUnits`. Non prepara ATA né `discoverSector`. Avvia orchestra automaticamente la preparazione degli step consentiti dalle guardie chain; non servono click separati su Prepara/Firma nell'app, ma il wallet richiede approvazione esplicita per ogni transazione. SAE verifica ogni messaggio preparato e inoltra la transazione firmata una sola volta.
- `POST /api/sea/subwarp/prepare` verifica il fuel di andata/ritorno verso la SB configurata, prepara e simula `startSubwarp`; `POST /api/sea/warp/prepare` prepara `warpToCoordinate` con waypoint e guardia fuel round-trip; `/api/sea/movement/exit/prepare` prepara il `fleetStateHandler` Sly per Warp o Subwarp solo dopo l'ETA e per il target chain atteso.
- Il pulsante Salva persiste nel browser i soli campi modificabili, con chiave distinta per profilo e flotta; alla riapertura i campi read-only vengono ricalcolati dalla chain.
- La modalità Warp/Subwarp e la checkbox `Usa fee Sly` sono scelte locali persistite per profilo e flotta; la fee Sly è attiva di default con base 1 lamport, mentre disattivandola la fee viene lasciata al wallet/RPC. Per `scan_cost = 0`, `food_min` è forzato a `0` e non modificabile; i dati scan cost/SDU per scan provengono da `stats.misc_stats` dello snapshot fleet.
- La selezione API non invia istruzioni SAGE. `scanForSurveyDataUnits` resta l'unica istruzione della propria transazione (`MustBeOnlyInstruction`). La preparazione scan non crea PDA: se settore o account scanner mancano, si blocca prima della simulazione. La simulazione locale delle coordinate è attiva di default.
- Avvia/Stop controlla il ciclo chain-driven: se la flotta è `Idle` e il cooldown scan è scaduto, Avvia prepara automaticamente la scan sulla `sector` corrente; se il cooldown è attivo, richiede subito la destinazione API e attende il timestamp chain solo quando serve una scan sul posto. Dopo ogni approvazione wallet e conferma scan, Sea registra l'esito, rilegge risorse e richiede la destinazione API. Prepara automaticamente il movimento scelto; dopo l'approvazione wallet attende `arrival`, prepara l'exit e apre una nuova richiesta di approvazione wallet. Su conferma exit e snapshot `Idle`, riparte con scan on-site, poi selezione. Non servono click separati sui pulsanti Prepara/Firma dell'app; ogni transazione richiede comunque approvazione esplicita nel wallet, Avvia non approva né firma transazioni. Il cooldown API locale non schedula cicli fissi: scan cooldown ed ETA provengono dalla chain. Chiudere il pannello Automation nasconde solo la UI e non ferma il ciclo; riaprendolo sulla stessa flotta lo stato viene ripristinato. Cambiare flotta o lasciare la pagina arresta/termina il ciclo. Se Sea viene riaperta durante il movimento, riprende dal target `to` on-chain. Il primo errore di risorse, stato flotta inatteso o selezione destinazione mantiene un fault rosso fino al click su Arresta; il fault persiste per flotta anche chiudendo/riaprendo il pannello. Avvia è abilitato con risorse disponibili e flotta `Idle` o in movimento con target chain valido; Arresta resta disponibile durante l'esecuzione o il fault. L'ingranaggio distingue stato attivo (verde), arrestato e riavviabile (rosso), fault bloccato (rosso), non avviabile (grigio). Il resupply docked non è orchestrato automaticamente; PDA mancanti bloccano il ciclo senza creazione.
- I log browser con prefisso `[SDU]` riportano risorse, configurazione, payload/risposta scan-filter, cicli, errori e fee di rete effettiva (`meta.fee`, lamports/SOL); dopo una scan confermata la riga flotta e il pannello Informazioni mostrano `Scanned: <probabilità arrotondata>% +<SDU>SDU`, ricavati dai log SAGE e dal delta dei token balance. In movimento prevale lo stato Warp/Subwarp; l'ultimo esito resta disponibile nella sessione Sea. Il backend registra le fee finali e gli errori di lettura risorse oscurando gli URL RPC.
- Il payload usa `requestType: cell`, salvo un passaggio osservato di fuel da sopra a sotto `fuel_min`, che forza una singola richiesta `area`; il flag è consumato durante la costruzione del payload, anche se la chiamata API fallisce, come nella macro. `reset_counts` resta `false`.
- Il ciclo API aggiorna snapshot, posizione e saldi prima di ogni richiesta. `pause_strike`/soglia strike non sono ancora attivi perché dipendono dall'esito di uno scan reale.
- `currentCoords`/cella precedente viene dalla `sector` dell'ultimo snapshot chain; la selezione API aspetta `Idle` e non usa una posizione interpolata durante il movimento.
- Se la destinazione API è diversa dalla posizione chain, si può preparare manualmente Warp o Subwarp con guardia fuel round-trip, poi completare il movimento dopo l'ETA; Warp prepara un waypoint per transazione. Non sono implementati attesa automatica, scelta automatica del waypoint successivo né rientro/resupply alla SB. Per sicurezza SAE non crea PDA: settore e account scanner devono essere già presenti, altrimenti la preparazione scan fallisce senza generare transazioni.
- Il polling non equivale al trigger macro completo: mancano lettura dello stato scanned, trigger fuel/strike e aggiornamento della posizione dopo il movimento.
- La policy CSP del browser non deve aprire connessioni a host arbitrari; il relay mantiene la destinazione upstream limitata a host locali/privati.

### Fase 0: confini e contratti Sea/SAE

- Mappare le dipendenze già usate da Sea e classificare ciascuna come logica Sea, infrastruttura riusabile SAE o adattatore; mantenere cache e accesso chain condivisi senza delegare loro le decisioni del ciclo.
- Definire contratti tipizzati per snapshot/risorse flotta, selezione destinazione, preparazione e simulazione transazioni, wallet e inoltro. Le regole di cooldown, trigger, movimento e resupply restano di proprietà Sea.
- Delimitare i moduli logici: stato flotta e risorse; selezione/validazione destinazione API; policy scan e stato per flotta; pianificazione del ciclo Sly; confine transazioni; UI e coordinamento. Accorpare o separare i file secondo la complessità reale, preservando questi confini.
- Definire le transizioni e i dati persistenti del ciclo per flotta, inclusi target attivo, cooldown e risultati chain, così errori e refresh non causano duplicati né perdite di stato.
- Per ogni confine documentare responsabilità, contratto e fixture dei casi rilevanti. Usare queste fixture per isolare le modifiche e verificare la fedeltà del comportamento; evitare moduli senza responsabilità autonoma.

### Fase 1: configurazione e stato flotta

- Riutilizzare la finestra Automation esistente e i parametri di `macrov9.1.py`; distinguere configurazione editabile da dati letti on-chain.
- Popolare fleet ID/nome, posizione, capacità e statistiche dal feed; completare la lettura dei saldi SPL necessari per cargo e SDU oltre ai saldi fuel/food già esposti on-demand.
- Derivare la velocità in unità Sly (`raw / 1e6`) e il range consigliato dal cooldown; non codificare valori per una flotta campione.
- Completare la persistenza locale già iniziata e definire import/export dei parametri prima di portare l'intero set di impostazioni.

### Fase 2: replica della selezione macro

- Completare i trigger macro: `pause_strike`, soglia minima e `reset_counts` dopo scan reali; il crossing `fuel_min`→`area` one-shot è già portato nel polling API.
- Verificare il relay same-origin con fixture legacy e host API privato; il server di selezione resta invariato.
- Portare la richiesta da manuale a trigger automatico solo dopo aver replicato cooldown/strike; mantenere la stessa normalizzazione coordinate e l'ordinamento delle due SB.
- Validare risposta e coordinate prima di usarle; registrare richiesta, risposta, motivo `cell/area`, fuel e decisione.
- Conservare simulazione offline come modalità esplicita; non usarla silenziosamente quando l'API live fallisce.

### Fase 3: movimento e ciclo Sly completo

- Usare la coordinata API come unico target del ciclo; usare `sb` della risposta se presente, altrimenti applicare il fallback attuale della macro.
- Portare i soli primitive necessari: fetch/refresh account, guardie food/cargo/fuel, stima andata-ritorno secondo il movement type, movement Warp/Subwarp e `scanForSurveyDataUnits` su settore/account scanner già esistenti.
- Scan alla posizione corrente e start/exit Warp/Subwarp sono preparabili, simulabili, firmabili dal wallet e inoltrabili da SAE. PDA mancanti bloccano il flusso senza creazione implicita. Completare orchestrazione/attesa automatica e avanzamento waypoint; solo dopo l'arrivo e le guardie risorse si prepara la scan.
- Se la guardia fuel non consente il ciclo, instradare alla SB e fare il resupply Sly; dopo il rifornimento rileggere chain state e risorse prima di riprendere.
- Conservare cooldown e stato per flotta così refresh/errori RPC non generano scansioni duplicate né perdono il target attivo.

### Fase 4: sicurezza e verifica

- Separare chiaramente test/simulazione da mainnet live; nessuna chiave privata in config o backend.
- Le istruzioni sono costruite e simulate lato SAE, ma firmate solo dal wallet browser; il backend inoltra unicamente il messaggio già simulato e firmato. Non custodire chiavi e non portare il `customKeypair` opzionale di Sly.
- Richiedere la connessione wallet solo all'avvio esplicito del ciclo/alla prima preparazione transazione; la selezione API e la lettura chain non mostrano controlli Connetti/Disconnetti. Ogni transazione mantiene il prompt di approvazione del wallet.
- Mostrare flotta, coordinate, istruzioni, simulazione e costo prima del click di firma; rispettare sempre la conferma richiesta dal wallet.
- Confrontare con fixture legacy: payload API byte/semantica invariati, scelta cell/area, doppia SB, fuel sotto soglia, API down, fuel insufficiente, rientro, rifornimento, scan e cooldown.
- Provare prima senza invio (mock/simulazione), poi su ambiente controllato; nessuna transazione mainnet durante la fase di studio.

## Decisioni e rischi aperti

- **Unità API e valori**: confermare con fixture quali input numerici il server interpreta come stringhe/numeri e il significato esatto di `rangeSB`, `fuel_range_min` e `reset_counts`.
- **Relay API**: il proxy SAE consente solo loopback e IPv4 RFC1918; host pubblici/DNS non sono ammessi senza una allowlist esplicita.
- **Fuel**: mantenere come guardia operativa il calcolo Sly basato su saldi chain e movement type; la stima percentuale client della macro non deve sostituirlo né sovrascriverlo.
- **Doppia SB**: confermare quale SB usare per rifornimento quando la risposta API non specifica `sb` e come aggiornare la base dopo un rientro.
- **Wallet browser**: richiedere la connessione soltanto al momento della firma; verificare che profilo e permission SAGE corrispondano alla flotta selezionata.
- **Disponibilità dati**: sono esposti fuel e food; cargo complessivo e SDU richiedono ancora lettura/decodifica dei relativi token account.

## Riferimenti analizzati

- [Macro `macrov9.1.py`](../../sly/macrov9.1.py): trigger, stato, payload, API, guardie, fallback clipboard/on-chain e configurazione.
- [SLY knowledge index](../../sly/SLY_KNOWLEDGE_INDEX.md): mappa di `handleScan`, `handleMovement`, `handleResupply`, calcolo fuel e primitive `execScan`.
- [SLY estratti indicizzati](../../sly/SLY_7.36mio.js.md): implementazioni delle primitive di scan/movement/resupply; auto-movement e scan-map sono consultati solo per escluderli dal port.


## Flusso concettuale del programma SDU

Il ciclo ordinario è chain-driven: scan sul posto → conferma on-chain → estrazione e invio del risultato scan (probabilità e delta SDU) al sink metriche previsto → richiesta nuove coordinate all'API → guardie Sly → Warp/Subwarp scelto → attesa ETA on-chain → exit firmato → nuova valutazione dello stato e delle risorse.

La percentuale restituita dal selettore (`response[%]`) e la probabilità della scan SAGE sono dati distinti: la prima descrive la selezione della destinazione, la seconda si ricava dall'esito della transazione scan. Il risultato scan aggiorna anche contatori e trigger locali previsti dalla macro; non va aggiunto al payload `/api/scan-filter` senza un contratto esplicito.

### Stato iniziale

- **Idle senza scan cooldown:** preparare una scan sulla `sector` chain corrente. Dopo conferma e registrazione del risultato, chiedere la prima destinazione API.
- **Idle con scan cooldown attivo:** non ripetere la scan sul posto. Richiedere la nuova coordinata API e, se diversa dalla posizione corrente, iniziare il movimento mentre il cooldown scorre. Se la destinazione coincide con la posizione corrente, attendere il residuo del cooldown prima di preparare la scan.
- **MoveWarp/MoveSubwarp:** conservare il target `to` on-chain e attendere il residuo fino a `arrival`. All'ETA preparare e simulare l'appropriato `fleetStateHandler`, richiedere la firma, poi rileggere lo snapshot. Solo dopo che la chain mostra `Idle` si applicano guardie, scan cooldown e scan sul posto. Per Warp con waypoint intermedi, ripetere la valutazione del target fino alla destinazione finale.
- **StarbaseLoadingBay o resupply in corso:** distinguere una flotta semplicemente docked da una procedura di resupply già avviata. Completare solo le operazioni Sly mancanti, undockare con conferma chain e rileggere risorse/stato prima di riprendere; non duplicare carico, scarico o PDA. In modalità di sicurezza corrente, PDA mancanti bloccano il ciclo senza creazione implicita.

### Timer e trigger

- `scan_cooldown_expires_at` chain è la fonte autoritativa per sapere quando una nuova scan può essere inviata. `arrival`/`to` chain governano attesa e target del movimento; non stimare l'ETA dalla velocità se la chain fornisce il tempo effettivo.
- Il cooldown locale della macro serviva a coordinare l'attesa di Sly. In Sea non deve duplicare né sostituire i timer chain; il campo `scanCooldown` resta nel payload API con la semantica invariata, ma attesa scan e exit si decidono dai timestamp on-chain aggiornati.
- Timeout, errori RPC, stato inatteso o risorse insufficienti bloccano il ciclo senza invii automatici ripetuti. Se il backend rifiuta esplicitamente un prepare scaduto prima di `sendRawTransaction`, Sea può ripreparare e simulare una sola volta e richiedere una nuova approvazione wallet; non ritenta mai automaticamente un submit dall'esito ambiguo. Ogni scan, movimento, exit o operazione di resupply resta firmata esplicitamente dall'utente.