# Guida tecnica: integrare SEA come pagina di SAE

## Scopo e perimetro

Questa guida prepara un agente a portare la mappa isometrica di SEA dentro Star Atlas Explorer (SAE) come pagina aggiuntiva, senza sostituire la home, il flusso wallet o le viste esistenti.

L'analisi di SAE e' basata sul branch `main`, commit `2fb2072` osservato il 2026-10-09. Prima di implementare, ricontrollare i file sul branch corrente: route, build e UI possono cambiare.

Repository:
- [SAE](https://github.com/lucadjr88/sae)
- [SEA](https://github.com/lucadjr88/sea-atlas)

La scelta architetturale raccomandata e' una pagina multipagina dedicata alla mappa, servita dal backend SAE. Il frontend Phaser resta un modulo autonomo; il backend e gli RPC restano un solo servizio.

## Sintesi architetturale

| Area | SAE | SEA | Implicazione |
|---|---|---|---|
| Frontend | TypeScript senza framework UI, Vite 7, build multipagina | JavaScript ES modules e Phaser 3.80.1 caricato da jsDelivr | Aggiungere un entrypoint MPA isolato, non importare il bootstrap principale |
| Backend | Node ESM + TypeScript, Express 5, porta 3000 | Node CommonJS, server HTTP proprio, porta 3000 | Portare route/servizi SEA dentro Express SAE; non avviare il secondo server |
| Dati flotte | `fetchProfileFleets(profileId)`, RPC pool SAE e parser locale | Poll ogni 30 s, snapshot e WebSocket | Riutilizzare RPC e cache SAE; esporre un DTO mappa minimo |
| Asset | Vite scrive in `dist`; Express li serve dalla root | Immagini in `demo/assets`, servite da SEA sotto `/assets` | Copiare in `frontend/public/sea/assets` e usare URL assoluti |
| Profilo | Stato front-end in memoria `currentProfileId` | Profilo hardcoded in `server/config.js` | Passare il Player Profile ID attivo; eliminare il valore hardcoded SEA |

## Struttura SAE verificata

- `src/app.ts` crea Express, usa `express.json()`, monta le API e infine monta `frontendRouter` su `/`. La porta e' attualmente hardcoded a `3000`.
- Il backend e' ESM TypeScript (`package.json`, `type: module`); i moduli backend importano normalmente i sorgenti con estensione `.js`, anche quando il file sorgente e' `.ts`.
- `frontend/` contiene il client Vite. `frontend/index.html` e' la home e carica `frontend/src/main.ts`.
- Le pagine secondarie sono HTML separati in `frontend/pages/` con entry TypeScript dedicati in `frontend/src/pages/`. Le pagine legali sono esempi concreti di questo schema.
- `frontend/vite.config.ts` registra ogni pagina in `build.rollupOptions.input`; `outDir` e' `../dist` e `emptyOutDir` e' `false`, per preservare l'output backend.
- Gli alias Vite sono `@` -> `frontend/src`, oltre ad alias per `services`, `ui`, `utils` e `types`.
- Il pattern `frontend/src/main.ts` non e' riutilizzabile come entry SEA: inizializza wallet desktop/mobile, monta la homepage e il form profilo.
- `frontend/src/resultpage.ts` crea `#mainContainer`, la sidebar e `#result-container`. La sidebar e' a sua volta una navigazione della vista risultati.
- `frontend/src/ui/elements/toggleSwitch.ts` gestisce le viste `fee`, `resource`, `rental`, `sdu` dentro `#result-container`. Non e' un router di pagine intere.
- Lo stato `currentProfileId` di `frontend/src/utils/state.ts` e' una variabile di modulo, quindi non sopravvive a un caricamento completo di una pagina nuova.
- Il backend serve pagine e frontend tramite `src/backend/routes/frontend.ts`. In produzione serve `dist/` e ha un fallback verso `index.html`; `src/backend/routes/assets.ts` espone inoltre `/api/assets/*` e `/api/pages/*` con policy di cache.
- Il Content Security Policy applicato da `frontendRouter` consente `https://cdn.jsdelivr.net` per gli script e `ws:`/`wss:` nelle connessioni. Ricontrollarlo se Phaser, font, asset o endpoint cambiano.

Riferimenti SAE:
- [Backend entrypoint](https://github.com/lucadjr88/sae/blob/main/src/app.ts)
- [Frontend Vite config](https://github.com/lucadjr88/sae/blob/main/frontend/vite.config.ts)
- [Home entrypoint](https://github.com/lucadjr88/sae/blob/main/frontend/src/main.ts)
- [Result page](https://github.com/lucadjr88/sae/blob/main/frontend/src/resultpage.ts)
- [Sidebar](https://github.com/lucadjr88/sae/blob/main/frontend/src/ui/elements/sideBar.ts)
- [View toggle](https://github.com/lucadjr88/sae/blob/main/frontend/src/ui/elements/toggleSwitch.ts)
- [Frontend static router](https://github.com/lucadjr88/sae/blob/main/src/backend/routes/frontend.ts)
- [Asset router](https://github.com/lucadjr88/sae/blob/main/src/backend/routes/assets.ts)

## Struttura SEA verificata

### Frontend

- `client/index.html` definisce `#game` e `#hud`, importa Phaser 3.80.1 da jsDelivr e avvia `client/src/main.js` come ES module.
- `client/src/main.js` carica `/starbases`, crea `FleetFeed`, `Hud` e l'istanza Phaser; il registry Phaser passa i servizi alla `MapScene`.
- `client/src/scenes/BootScene.js` carica asset e avvia `MapScene`.
- `client/src/scenes/MapScene.js` gestisce camera, rotazione isometrica, snapshot, HUD e ciclo di update.
- `client/src/model/fleetPosition.js` interpola `MoveWarp` e `MoveSubwarp` tra settore origine e destinazione usando timestamp in millisecondi.
- `client/src/entities/FleetSprite.js` disegna la nave, orientamento, stato, etichetta, ring e rotta; `miningOrbit.js` gestisce il moto da mining.
- `client/src/map/iso.js`, `drawStarbases.js`, `isleSprites.js`, `shipSprites.js` contengono proiezione, isole e navi.
- Gli sprite vengono scelti da `demo/assets/ships_clean/meta.json`; le isole sono in `demo/assets/isles/`.
- Il client e' JavaScript browser nativo, non usa React e non ha un bundler proprio. I test client sono Node test runner (`cd client && npm test`).

### Backend

`server/server.js` ospita insieme API, WebSocket e file statici:
- `GET /fleets` restituisce lo snapshot corrente;
- `GET /starbases` restituisce le starbase con nomi visualizzati;
- WebSocket `/ws` invia lo snapshot all'apertura e a ogni poll;
- il poll e' ogni 30 secondi;
- `/assets/*` serve gli asset sotto `demo/assets/`, il resto serve `client/`;
- il server ascolta la porta `3000`, uguale a quella di SAE.

`server/fleets.js` decodifica lo stato SAGE, legge flotte possedute e in prestito, risolve i riferimenti a pianeti/starbase e normalizza stato/tempi. `server/starbases.js` carica e mette in cache la lista delle starbase. `server/config.js` contiene un profilo di esempio hardcoded e `rpcPoolFile` punta al file privato `rpc-pool-complete.json` fuori dal client.

Riferimenti SEA:
- [Map bootstrap](https://github.com/lucadjr88/sea-atlas/blob/main/client/src/main.js)
- [Map scene](https://github.com/lucadjr88/sea-atlas/blob/main/client/src/scenes/MapScene.js)
- [Fleet position](https://github.com/lucadjr88/sea-atlas/blob/main/client/src/model/fleetPosition.js)
- [Fleet feed](https://github.com/lucadjr88/sea-atlas/blob/main/client/src/data/FleetFeed.js)
- [Fleet decoder](https://github.com/lucadjr88/sea-atlas/blob/main/server/fleets.js)
- [SEA HTTP server](https://github.com/lucadjr88/sea-atlas/blob/main/server/server.js)
- [Ship assets loader](https://github.com/lucadjr88/sea-atlas/blob/main/client/src/map/shipSprites.js)

## Navigazione: decisione raccomandata

La mappa e' un'esperienza full-screen con canvas, camera e HUD, non un pannello analitico dentro `#result-container`. Aggiungerla come voce del toggle `fee/resource/rental/sdu` costringerebbe il canvas a condividere dimensioni e ciclo di vita con viste che vengono sostituite via `replaceChildren()`.

Preferire una pagina dedicata, ad esempio:

- HTML: `frontend/pages/sea.html`;
- entrypoint: `frontend/src/pages/seaPage.ts`;
- bundle Phaser/moduli: `frontend/src/sea/`;
- CSS isolato: `frontend/src/sea/sea.css`;
- asset statici: `frontend/public/sea/assets/`;
- link d'accesso: elemento esplicito dalla sidebar dei risultati o dalla home, secondo la UX scelta.

La pagina deve avere un mount point proprio per Phaser (`#game`, `#hud`) e il viewport a piena altezza. Non deve caricare `frontend/src/main.ts`, `createHomePage()` o inizializzare una seconda volta il wallet.

Per un link dalla vista risultati, costruire l'URL con il profilo attivo: `/pages/sea.html?profileId=${encodeURIComponent(currentProfileId)}`. Validare il parametro sia nel client per UX sia nel backend; non trattare wallet public key e Player Profile ID come sinonimi. Se si preferisce evitare il query string, definire esplicitamente uno storage same-origin con chiave e ciclo di vita documentati. Non fare affidamento sulla variabile `currentProfileId` dopo la navigazione: la pagina MPA ricarica il runtime.

## Dati e integrazione backend

### Cosa esiste gia' in SAE

- `src/backend/routes/get-fleets.ts` monta `GET /api/debug/get-fleets?profileId=...` e chiama `fetchProfileFleets()`.
- `src/utils/fetchProfileFleets.ts` usa `RpcPoolManager`, filtra account SAGE con memcmp offset `41` (owner profile) e decodifica manualmente `fleet_state`.
- Il parser restituisce snake_case, campi di stato annidati in `fleet_state` e anche `raw` account in base64. Salva inoltre i dati in `cache/<profileId>/fleets/`.
- L'endpoint esistente e' sotto `/api/debug`, ha log dettagliati e il parser mostrato filtra il proprietario ma non fa la seconda query per flotte in prestito (offset `105`) prevista da SEA.
- `src/backend/routes/get-fleet-info-minimal.ts` e' una lettura di dettaglio per singola flotta, anche tramite binario Rust; non e' il feed adatto alla mappa.
- SAE ha gia' `@solana/web3.js`, Anchor, IDL SAGE e un pool RPC adattivo (`RpcPoolManager`). La nuova funzione non dovrebbe introdurre una seconda pool o leggere `rpc-pool-complete.json` di SEA.

### Endpoint mappa da aggiungere

Aggiungere una route non-debug, ad esempio `GET /api/sea/snapshot?profileId=...`, montata in `src/app.ts` prima del router statico. La route deve riusare `fetchProfileFleets()`/`RpcPoolManager` oppure estrarre una funzione condivisa dal parser esistente. Non duplicare endpoint RPC, IDL o logica di selezione RPC in un nuovo processo Node.

Il route adapter deve:
1. validare `profileId` come `PublicKey` Solana e restituire `400` per input invalido;
2. trovare le flotte possedute e, se il requisito SEA resta invariato, quelle in prestito con il filtro borrower a offset `105`;
3. risolvere una sola volta, con `getMultipleAccountsInfo`, i riferimenti di `MineAsteroid` (account pianeta) e `StarbaseLoadingBay` (account starbase) per ottenere il settore;
4. restituire solo i campi usati dal renderer, mai `raw`, pool RPC, URL con API key o dati non necessari;
5. usare cache breve per profilo e deduplicazione delle richieste contemporanee, cosi' i refresh di piu' client non moltiplicano `getProgramAccounts`;
6. propagare errori in forma stabile senza restituire stderr, URL RPC o dettagli sensibili.

DTO compatibile con `fleetPosition()` di SEA:

```json
{
  "profileId": "<PlayerProfileId>",
  "updatedAt": 0,
  "error": null,
  "fleets": [
    {
      "id": "<fleet pubkey>",
      "name": "<fleet label>",
      "borrowed": false,
      "size": "small",
      "ships": 1,
      "state": "MoveSubwarp",
      "sector": null,
      "from": [0, 0],
      "to": [1, 1],
      "departure": 0,
      "arrival": 0,
      "scanCooldownEnd": 0
    }
  ]
}
```

Convenzioni del DTO:
- `state` e' il nome enum (`Idle`, `MineAsteroid`, `MoveWarp`, `MoveSubwarp`, `StarbaseLoadingBay`, ...), non `fleet_state` annidato.
- `from`/`to` sono coppie `[x,y]`; `sector` e' la posizione risolta per stati fermi o riferimenti a account.
- I timestamp devono essere millisecondi JavaScript. Il parser SAE legge i timestamp SAGE come interi; verificare le unita' dell'IDL e convertire secondi in millisecondi una sola volta nell'adapter (`* 1000`), non in ogni renderer.
- `size` usa le classi attese da `client/src/map/shipSprites.js`: `xxSmall`, `xSmall`, `small`, `medium`, `large`, `capital`, `commander`, `titan`.
- Se SEA richiede l'animazione scanning, fornire `scanCooldownEnd` in millisecondi.

Starbase DTO per `drawStarbases()`/HUD:

```json
[{"id":"<pubkey>","name":"CSS/MRZ","sector":[0,0],"faction":"MUD","level":6,"kind":"css"}]
```

Il backend SAE non espone attualmente una route generale `/starbases` equivalente a SEA. Aggiungere una route namespaced (`GET /api/sea/starbases`) che riusi il programma SAGE e una cache lunga, oppure portare i dati statici aggiornati in un formato controllato. `kind` puo' essere derivato dalla classificazione SEA (`css`, `faction`, `mrz`) o calcolato nel client; scegliere un solo punto di verita'.

### REST prima di WebSocket

Per la prima integrazione, preferire refresh REST ogni 15-30 secondi, con cache backend per profilo. L'interpolazione gia' implementata in `fleetPosition()` continua a essere fluida tra snapshot: non occorre aggiornare la posizione on-chain a ogni frame.

Se il requisito richiede WebSocket:
- SAE non dichiara attualmente `ws` come dipendenza diretta;
- non avviare `sea/server/server.js` su una seconda porta;
- collegare il WebSocket server allo stesso `http.Server` Express, su un path namespaced come `/ws/sea`, e aggiungere la dipendenza al package root;
- assicurare `ws:` in sviluppo e `wss:` in produzione dietro TLS/proxy;
- inviare il DTO minimo e rispettare la stessa cache/limite RPC del percorso REST.

## Frontend Phaser in Vite

1. Copiare/adattare i moduli SEA in `frontend/src/sea/` come ES modules importati dall'entry `seaPage.ts`.
2. Aggiungere `frontend/pages/sea.html` con i mount point Phaser e lo script Phaser caricato prima dell'entry module. Il CSP attuale ammette jsDelivr, ma verificare la CSP effettiva in produzione. In alternativa, valutare una dipendenza Phaser npm esplicitamente versionata.
3. Aggiungere la pagina all'oggetto `rollupOptions.input` di `frontend/vite.config.ts`, con chiave `pages/sea` e path `frontend/pages/sea.html`.
4. Mettere asset statici in `frontend/public/sea/assets/` perche' Vite li copi in `dist/sea/assets/`. Portare almeno `demo/assets/ships_clean/` e `demo/assets/isles/`; includere altri asset solo se usati.
5. Aggiornare `shipSprites.js` e `isleSprites.js`: i path relativi `assets/...` attuali, da una pagina `/pages/sea.html`, risolverebbero sotto `/pages/`. Usare path assoluti stabili come `/sea/assets/ships_clean/...`.
6. In `seaPage.ts`, creare il feed con endpoint same-origin `/api/sea/snapshot` e la scena Phaser con le starbase ricevute. Non importare la entry principale SAE, che inizializza wallet e homepage.
7. Mantenere CSS della mappa isolato. La pagina deve poter ridimensionarsi con Phaser `Scale.RESIZE` senza ereditare accidentalmente le regole di `#mainContainer` e della dashboard.
8. In produzione costruire `ws` URL in base a `location.protocol` (`ws:` locale, `wss:` HTTPS); non lasciare `ws://${location.host}` hardcoded.
9. Non conservare riferimenti DOM dopo l'uscita dalla pagina; interrompere polling/WebSocket e distruggere l'istanza Phaser quando la pagina viene smontata o ricreata.

## Bootstrap, API e compatibilita'

- Tutte le chiamate frontend devono essere relative allo stesso host (`/api/sea/...`); cosi' non serve CORS aperto e la sessione/cookie, se introdotta, resta same-origin.
- SAE usa un entrypoint pagina dedicato per le pagine statiche. Il fallback SPA di Express non sostituisce la registrazione dell'entry MPA nel build Vite.
- In sviluppo ci sono due processi: `npm run dev` root avvia Express con `tsx`; `cd frontend && npm run dev` avvia Vite. La config Vite corrente non definisce un proxy API: verificare/aggiungere proxy verso `localhost:3000` oppure testare la pagina attraverso l'Express che serve `dist`.
- Per evitare conflitto di porta, non eseguire il server SEA sulla `3000` quando SAE e' attivo. SEA va incorporato nel processo root e distribuito dal normale processo PM2 SAE.
- `process.env.NODE_ENV` e' gia' caricato tramite `dotenv/config.js`; ogni nuovo segreto o URL infrastrutturale deve avere template `.env.example`, validazione e documentazione. Nessuna API key nei sorgenti, HTML, bundle Vite o log.
- La pagina deve gestire: loading, errore RPC, snapshot vuoto, WebSocket disconnesso (se usato), dati stantii e ritorno alla home/analisi senza perdere il profilo.

## Profili, privacy e sicurezza

- Il Player Profile ID e il wallet public key sono dati pubblici ma distinti. Il feed deve usare il Profile ID, ottenuto dal flusso SAE, non il profilo hardcoded in `sea/server/config.js`.
- Validare input e limitare la frequenza per profilo. Non permettere al client di inviare `rpcUrl`, path filesystem, URL di asset o account da decodificare arbitrariamente.
- Riutilizzare il pool RPC SAE e il suo health/backoff/concurrency manager. Non copiare la pool SEA: contiene URL e API key private, e va mantenuta fuori da Git e dal bundle.
- Escludere `raw` account base64 dal DTO e dalla console; non esporre endpoint debug con log completi al browser pubblico.
- Conservare il carattere read-only del client: nessuna firma, transazione, seed phrase o chiave privata richiesta dalla mappa.
- Verificare la licenza/diritti di distribuzione degli asset nave/isola prima di renderli pubblici sul dominio SAE. Mantenere il disclaimer di progetto indipendente gia' presente in SAE.

## Build e verifica

Comandi SAE osservati:

```sh
npm install
cd frontend && npm install
cd ..
npm run build
npm start
```

`npm run build` compila TypeScript backend, aggiunge le estensioni `.js` agli import compilati, esegue il build Vite e copia IDL/binari richiesti in `dist`. `frontend/package.json` esegue `tsc && vite build`. `npm test` root e' un test RPC pool, non una suite end-to-end della pagina.

Verifiche di accettazione per l'integrazione:

1. `npm run build` produce `dist/pages/sea.html`, bundle entry e asset SEA sotto il path pubblico atteso, senza cancellare `dist/app.js`.
2. `GET /pages/sea.html`, asset Phaser, `GET /api/sea/starbases` e `GET /api/sea/snapshot?profileId=...` funzionano sullo stesso host/porta.
3. Profile ID invalido restituisce `400`; account/risposta RPC mancante produce errore controllato e non dati raw.
4. Test unitari coprono conversione stati/timestamp del DTO, risoluzione settori e interpolazione per `Idle`, `MineAsteroid`, `MoveWarp`, `MoveSubwarp` e `StarbaseLoadingBay`.
5. La pagina si apre sia direttamente sia dal link SAE, riceve il profilo corretto, non inizializza un secondo wallet e non collide con le viste fee/resource/rental/SDU.
6. Verificare resize, mobile, rotazione mappa, zoom, label/HUD, reconnect e performance con snapshot realistici.
7. Verificare la versione production: HTTPS, CSP, `wss` se presente, PM2 con un solo processo server e nessun riferimento a `rpc-pool-complete.json` nel bundle.

## Sequenza di implementazione suggerita

1. Aggiungere un adapter server-side che trasforma le fleet record SAE nel DTO SEA e testarlo con fixture; includere il filtro borrowed offset `105` se richiesto dal prodotto.
2. Aggiungere e testare risoluzione di pianeta/starbase e route `/api/sea/starbases`; introdurre cache breve e cache starbase lunga.
3. Portare la UI SEA in un entrypoint MPA autonomo e registrarlo in Vite; copiare solo gli asset necessari.
4. Collegare la pagina al profilo SAE corrente tramite URL e agli endpoint same-origin; usare REST polling inizialmente.
5. Aggiungere link dalla sidebar senza alterare il toggle delle viste; definire un ritorno alla pagina risultati/home.
6. Buildare, eseguire i test backend e fare smoke test browser in dev e dal server production build.
7. Solo dopo stabilita' del polling, valutare WebSocket sul server HTTP condiviso.

## Questioni da confermare prima del codice

- La mappa deve essere accessibile dalla home, dalla sidebar risultati o da entrambe?
- Per l'utente senza wallet, il Profile ID viene passato dalla form o va richiesto anche nella pagina mappa?
- La mappa deve mostrare flotte possedute soltanto o anche quelle in prestito? L'endpoint SAE attuale fa solo il filtro owner a offset `41`.
- La lista starbase va aggiornata on-chain o basta cache giornaliera/asset statico?
- Il requisito di aggiornamento richiede WebSocket o e' sufficiente REST ogni 15-30 secondi con interpolazione client?
- Gli asset nave/isola SEA possono essere distribuiti nel sito pubblico SAE?
