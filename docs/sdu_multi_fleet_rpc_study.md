# Studio di Fattibilità: Automazione SDU Multi-Flotta e Ottimizzazione RPC (Modello Sly)

## 1. Come funziona Sly (`SLY_7.36mio.js`) e perché consuma pochissime RPC

L'analisi di `SLY_7.36mio.js` mostra perché Sly riesce a far girare molte flotte in parallelo senza saturare gli RPC e senza sovrascrivere lo stato tra una flotta e l'altra:

### 1.1 Inizializzazione unica all'avvio (`init` + `initUser`, righe 490–560 e 7967–8120)
In Sly le chiamate pesanti (`getProgramAccounts` / `.all()`) vengono eseguite **una sola volta al boot**, mai durante il ciclo operativo delle flotte:
- `sageGameAcct` (`sageProgram.account.game.all()`, riga 492)
- `sageSDUTrackerAcct` (`sageProgram.account.surveyDataUnitTracker.all()`, riga 502)
- `cargoStatsDefinitionAcct` e `cargoTypes` (righe 509–530)
- `userProfileFactionAcct` (`profileFactionAccount.all()`, riga 7968)
- `userXpAccounts` e `progressionConfigAcct` (calcolati localmente come PDA deterministici con `findProgramAddressSync`, righe 7982–7987)
- Elenco flotte `userFleets` (`fleet.all()` per owned e borrowed, righe 7989–8009) con pre-calcolo locale di tutte le ATA/PDA della flotta (`fuelToken`, `foodToken`, `sduToken`, `cargoHold`, `fuelTank`, righe 8050–8110).

**Dopo l'avvio, Sly non chiama mai più `getProgramAccounts`.**

### 1.2 Ciclo per-flotta indipendente e scaglionato (`startAssistant` -> `startFleet(i)` -> `operateFleet(i)`)
- Ogni flotta `userFleets[i]` mantiene il proprio stato nel proprio oggetto (`userFleets[i].state`, `scanEnd`, `moveEnd`, `scanLastFuelAmount`, `moveTarget`, `stopping`) e un proprio loop `setTimeout(() => startFleet(i), 10000)` (riga 7164).
- All'avvio (`startAssistant`, riga 7618), la partenza delle flotte è **scaglionata di 1.5s** (`setTimeout(() => startFleet(i), 1500 * (i + 1))`) per non inviare mai raffiche RPC simultanee.

### 1.3 Zero chiamate RPC durante Cooldown e Movimento
- **Durante lo scan cooldown (`operateFleet`, righe 7027–7036)**:
  ```javascript
  const waitingForScan = userFleets[i].scanEnd && (Date.now() <= userFleets[i].scanEnd);
  if (scanning && onTarget && waitingForScan) return;
  ```
  Finché `Date.now() <= scanEnd`, `operateFleet(i)` esce **immediatamente prima di qualunque chiamata RPC** (`0 RPC`).
- **Durante il movimento (`handleMovement`, righe 5305–5311)**:
  ```javascript
  userFleets[i].moveEnd = endTime;
  await wait(moveTime * 1000);
  while (endTime > Date.now()) {
      await wait(Math.max(1000, endTime - Date.now()));
  }
  ```
  Durante tutto il viaggio Subwarp/Warp, la flotta attende localmente fino a `endTime` (`0 RPC`).
- **Al risveglio**: Sly legge **solo l'account di quella singola flotta** con `getAccountInfo(userFleets[i].publicKey)` (righe 7046, 5292, 5339), mai tutte le flotte del profilo.
- **Tracciamento locale del Fuel (`scanLastFuelAmount`)**: dopo lo scan legge il fuel tank una volta sola (`scanLastFuelAmount`, riga 5512) e durante il subwarp/warp scala localmente il consumo calcolato (`scanLastFuelAmount -= moveDist * (subwarpFuelConsumptionRate / 100)`, riga 5282).

### 1.4 Costruzione transazioni e conferme (`execScan`, `execSubwarp`, `signatureStatusHandler`)
Poiché tutti gli account di protocollo (`sageGameAcct`, `sageSDUTrackerAcct`, `cargoTypes`, `userProfileFactionAcct`, `userXpAccounts`, `progressionConfigAcct`, `fleet.*Token`) sono già in memoria dal boot:
- `execSubwarp` (riga 1822) e `execExitSubwarp`: fanno **0 letture di account** prima di costruire l'istruzione (solo `getLatestBlockhash` + `sendRawTransaction`).
- `execScan` (riga 1742): verifica solo `sector` (1 lettura) prima di costruire l'istruzione.
- **Coda unica di conferma (`signatureStatusHandler`, righe 1469–1503)**: tutte le flotte in attesa di conferma inseriscono il proprio `txHash` in `signatureStatusQueue`; un unico timer ogni 2s chiama `getSignatureStatuses(txHashes)` in **batch** per tutte le flotte insieme.

---

## 2. Verifica del problema attuale in SAE (`Hud.js` + `FleetFeed.js` + `sea.ts`)

Confrontando SAE con Sly emergono i due problemi che causano sia il blocco della seconda flotta sia l'errore **"Server non raggiungibile"**:

### 2.1 Perché avviare una flotta blocca l'altra (`Hud.js`)
In `frontend/src/sea/ui/Hud.js`, invece di avere uno stato per ogni flotta come `userFleets[i]` in Sly:
1. Lo stato dell'automazione è cablato in variabili singole sull'istanza `Hud` (`this.automationFleet`, `this.automationRunning`, `this.automationRunId`, `this.automationRunTimer`, `this.automationDestination`, `this.scanPolicy`).
2. In `openAutomation(fleet)` (righe 422–427):
   ```javascript
   const continuing = this.automationFleet?.id === fleet.id && (this.automationRunning || this.automationFaulted);
   if (!continuing) {
     if (this.automationRunning) this.stopAutomation();
     this.scanPolicy.reset();
     ...
     this.automationFleet = fleet;
   ```
   Aprire il pannello di una seconda flotta chiama forzatamente `this.stopAutomation()` sulla prima e resetta `scanPolicy`.
3. Il ciclo legge i parametri direttamente dagli `<input>` del singolo modale DOM (`this.automationForm`), che viene sovrascritto quando si apre un'altra flotta.

### 2.2 Perché SAE genera troppe chiamate RPC rispetto a Sly
A differenza di Sly, SAE oggi ripete da zero le chiamate di inizializzazione **ad ogni singola azione** e fa polling globale continuo:
1. **Polling globale pesante (`GET /api/sea/snapshot` ogni 20s in `FleetFeed.js`)**:
   - Ogni 20s (con TTL cache 15s), `createSnapshot(profileId)` esegue **due `getProgramAccounts` pesanti** (`fetchProfileFleets` offset 41 e 105) + `resolveSectors`, anche quando le flotte stanno solo aspettando un timer noto (cooldown o ETA subwarp).
   - Inoltre, in `FleetFeed.js` (riga 93), qualsiasi messaggio WebSocket (`slotNotification` / `accountNotification`) invoca immediatamente `await this.pollOnce()`, moltiplicando le richieste a `/api/sea/snapshot`.
2. **Rilettura degli account statici di protocollo a ogni `prepare` (`src/backend/routes/sea.ts`)**:
   - Mentre Sly legge `Game`, `SurveyDataUnitTracker`, `CargoStatsDefinition`, `CargoType` e `ProfileFaction` **una sola volta all'avvio**, `sea.ts` li rilegge via RPC **ad ogni singolo `scan/prepare`, `subwarp/prepare`, `warp/prepare`, `movement/exit/prepare` e `fleet-resources`** (inclusi `surveyDataUnitTracker.all()` e `getProgramAccounts(PROFILE_FACTION_PROGRAM_ID)`).
   - In `subwarp/prepare` (righe 1111 e 1137), l'account `Game` viene scaricato **due volte nella stessa richiesta**.

---

## 3. Soluzione basata sul modello Sly (minima invasività, massima efficienza RPC)

Seguendo esattamente l'architettura di Sly, il problema si risolve con modifiche mirate e pochissimo codice:

### 3.1 Frontend (`Hud.js` + `FleetFeed.js`): Oggetto stato per-flotta come `userFleets[i]` in Sly
1. **Stato per-flotta (`this.fleetAutomations = new Map()`)**:
   - Come `userFleets[i]` in Sly, ogni `fleetId` ha il proprio oggetto stato indipendente (`running`, `faulted`, `runId`, `runTimer`, `scanPolicy`, `config`, `resources`, `destination`, `lastScanSummary`, `prepared`, flag di movimento/scan).
   - `openAutomation(fleet)` si limita a puntare il modale sulla flotta selezionata (`this.automationFleet = fleet`) popolando gli input e i pulsanti dallo stato di quella flotta, **senza mai chiamare `stopAutomation()` sulle altre flotte**.
   - Quando l'utente avvia più flotte, un leggero stagger (es. `1500ms` come in `startAssistant` di Sly) o una coda sulle sole transazioni evita che due `prepare`/`submit` partano nello stesso istante.
2. **Zero chiamate durante Cooldown e Movimento + aggiornamento locale Fuel**:
   - Come in Sly (`scanLastFuelAmount`, righe 5512 e 5282), durante il ciclo non serve richiamare `/api/sea/fleet-resources` se il fuel è già stato letto o restituito da `subwarp/prepare` (`result.fuelCurrent`): la percentuale fuel può essere aggiornata localmente dopo ogni movimento e riletta on-chain solo quando necessario.
   - In `FleetFeed.js`, evitare che notifiche WebSocket ad alta frequenza (`slotNotification`) scatenino `pollOnce()` senza throttling.

### 3.2 Backend (`src/backend/routes/sea.ts`): Inizializzazione unica degli account statici come `init` di Sly
Senza cambiare nessuna route né firma API, basta replicare in `sea.ts` ciò che Sly fa alle righe 492–530 e 7968:
1. **Caricare una sola volta (lazy-init in memoria) i 4 oggetti immutabili di SAGE**:
   - `sageGameAcct` (`Game`)
   - `sageSDUTrackerAcct` (`SurveyDataUnitTracker`)
   - `cargoStatsDefinition` + i 3 `CargoType` (`sdu`, `food`, `fuel`)
   - `profileFaction` per `profileId`
2. **Effetto immediato sulle route esistenti (senza riscriverne la logica)**:
   - `/sea/scan/prepare`: non chiama più `game.fetch`, `surveyDataUnitTracker.all()`, `getProgramAccounts(PROFILE_FACTION)`, `cargoStatsDefinition.fetch`, `cargoType.fetch` $\rightarrow$ resta solo la verifica di `sector` + `getLatestBlockhash` + `simulateTransaction` (**da 9 RPC a 3 RPC, zero `getProgramAccounts`**).
   - `/sea/subwarp/prepare` e `/sea/warp/prepare`: non chiamano più `game.fetch` (2 volte) né `getProgramAccounts(PROFILE_FACTION)` $\rightarrow$ resta solo la lettura del saldo `fuelToken` + `getLatestBlockhash` + `simulateTransaction` (**da 6–7 RPC a 3 RPC, zero `getProgramAccounts`**).
   - `/sea/movement/exit/prepare`: non chiama più `game.fetch`, `cargoStatsDefinition.fetch`, `cargoType.fetch` $\rightarrow$ resta solo `getLatestBlockhash` + `simulateTransaction` (**da 5 RPC a 2 RPC**).
   - `/sea/fleet-resources`: usa i mint già noti di `Game` e legge `fuel` e `food` in **1 sola chiamata** `getMultipleAccountsInfo([fuelToken, foodToken])` (**da 4 RPC a 1 RPC**).

