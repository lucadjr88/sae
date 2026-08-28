# Analisi migrazione SRSLY v2

## Conclusione breve

No. `npm i @sly-rentals/core` non aggiorna automaticamente la sezione rental.

Nel workspace è installato `@sly-rentals/core@5.4.0`, un SDK che espone client generati e wrapper per costruire istruzioni SRSLY v2. Il backend SAE continua però a usare:

- l'IDL locale `src/backend/idl/srsly_idl.json`;
- discriminator e offset codificati in `src/backend/rental/decode.ts`;
- PDA e program ID hardcoded negli script rental;
- cache e shape API definite localmente in `RentalService` e nelle route Express.

L'SDK non sostituisce nessuno di questi livelli con la sola installazione.

## Evidenze rilevate

### Pacchetto installato

Il pacchetto dichiara:

- versione installata: `5.4.0`;
- stato: pre-1.0;
- generazione da Anchor IDL tramite Codama;
- entry point principale basato su `@solana/kit`;
- entry point `@sly-rentals/core/legacy` per istruzioni `@solana/web3.js`;
- subpath `@sly-rentals/core/idl` per l'IDL JSON;
- helper per account, PDA, network addresses, eventi e audit.

Sono disponibili wrapper per `createContract`, `acceptRental`, `cancelRental`, `closeRental`, `releaseRental`, `reserveRental`, `migrateContract` e altre istruzioni v2.

### Programma e IDL

L'IDL distribuito dal pacchetto è metadata `0.4.0` e indica il programma:

`SRSLYxcFnjd5jG2DpJw4as6UEyjwJQK1U4J1TD1hvZH`

Il progetto usa invece:

`SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT`

La verifica RPC su mainnet-beta ha confermato che entrambi gli indirizzi sono programmi BPF deployati, ma rappresentano due generazioni diverse. Il programma v2 risponde con 1.191 account `ContractState` riconoscibili dal discriminator `be8a0adfbd74de73`, con esempi da 267 e 658 byte; il programma legacy risponde con 527 account, con layout da 228 e 163 byte. Il discriminator è uguale, quindi non basta filtrare per discriminator: il program ID resta parte integrante del formato.

Verdetto operativo: `SRSLYxc...` è il target v2 e `SRSLY1...` va mantenuto solo per leggere o chiudere/migrare contratti legacy. Non bisogna usare l'IDL v2 contro `SRSLY1...`.

### Account e istruzioni

L'IDL locale espone quattro account (`ContractState`, `Fleet`, `RentalState`, `Thread`) e sette istruzioni, tra cui `pay_rental` e `reset_rental`.

L'IDL del core espone almeno `BorrowerState`, `ConfigState`, `ContractState` e `RentalState`, oltre a 27 istruzioni. Introduce, tra le altre, `reserve_rental`, `release_rental`, `invalidate_rental`, `migrate_contract`, `create_borrower` e gestione di config/thread.

Gli account v2 hanno un modello diverso. Per esempio, `ContractState` v2 include `durationMinSeconds`, `durationMaxSeconds`, `cancelDelayMin`, `weight`, `reservationsDisabled`, `activeRental`, `queuedRental`, `delegate`, `thread`, contatori e importi cumulativi. `RentalState` v2 include `borrowerState`, `borrowerProfile`, escrow, pagamenti pro-rata, service fee, discount, bid e uno status enum.

Il decoder locale assume invece layout posizionali fissi, per esempio:

- `ContractState` con lunghezza minima 228 byte e `payment_frequency` a offset 34;
- `RentalState` con lunghezza minima 163 byte e `rate` a offset 137;
- `current_rental_state` letto come pubkey a offset 99.

Questi offset non sono una strategia di compatibilità v1/v2: vanno sostituiti dal decoder generato/ufficiale per gli account v2. Riutilizzarli sui nuovi buffer può produrre dati apparentemente validi ma semanticamente errati.

### Transazioni e PDA

Gli script locali costruiscono transazioni con Anchor e IDL locale, derivando manualmente PDA come:

- `rental_contract` + fleet;
- `rental_state` + contract + borrower;
- `rental_authority`;
- thread su programma Antegen hardcoded.

Il core v2 pubblica helper PDA per contract, active/queued rental, borrower state, config, SAGE e thread. I seed principali restano in parte riconoscibili, ma il modello v2 aggiunge active/queued rental e borrower state. Le account list delle istruzioni v2 sono molto più ampie e includono config, vault, token account, thread/fiber e programmi CPI.

Di conseguenza, non è sufficiente cambiare la chiamata Anchor o sostituire un discriminator: le transazioni di list, accept, cancel, close e release devono essere ricostruite con le nuove account list e con le nuove semantiche.

## Cosa risolve il core

Il pacchetto è utile per:

1. usare l'IDL v2 ufficiale senza mantenere conversioni manuali verso il vecchio tipo Anchor;
2. generare e serializzare le istruzioni v2;
3. decodificare `ContractState` e `RentalState` v2 con codec generati;
4. derivare PDA SRSLY/SAGE/Antegen secondo il modello v2;
5. mantenere `web3.js` tramite l'entry point `@sly-rentals/core/legacy`;
6. ottenere helper per eventi, snapshot e calcolo di valori rental.

Non risolve automaticamente:

- la scelta della rete/program ID corretto;
- la migrazione dei contratti già esistenti;
- la compatibilità della cache `cache/contracts.json`;
- la shape delle API `/rentals/contracts`;
- il fetch e merge dei moduli Fleet/SAGE;
- i placeholder `decodeCargo`, `decodeAmmo` e `decodeCrew`;
- la sostituzione delle transazioni già implementate;
- la compatibilità Node ESM del bundle pubblicato.

Durante l'ispezione, l'import diretto `import('@sly-rentals/core')` e l'import ESM `import('@sly-rentals/core/legacy')` con Node 20.19.5 hanno fallito con `ERR_UNSUPPORTED_DIR_IMPORT` su directory interne `dist/esm/kit` e `dist/esm/utils`. L'import CommonJS `require('@sly-rentals/core/legacy')` funziona e restituisce gli helper attesi (`setSdkConfig`, `createContract`, `cancelRental`, `deriveContract`).

Il core configurato con `network: 'mainnet-beta'` restituisce `SRSLYxc...` come SRSLY, oltre a indirizzi SAGE, ATLAS, profile-faction e Antegen diversi da alcune costanti hardcoded nel progetto. Anche queste costanti devono provenire dalla configurazione v2, non essere riutilizzate dal legacy.

## Implicazioni applicative

### Lettura e indicizzazione

Il servizio attuale filtra gli account tramite discriminator locale e poi interpreta i buffer con offset manuali. Per v2 bisogna introdurre una distinzione esplicita tra account v1 e v2, oppure migrare tutti i consumer a v2. Il core documenta infatti che `fetchAllContracts` scarta account non decodificabili nel layout v2 e offre `fetchAllContractAddresses` per includere indirizzi pre-v2 nelle operazioni di migrazione.

La cache deve includere almeno versione/layout, program ID e rete. Una cache v1 non deve essere servita come se fosse un risultato v2.

### API

La risposta `RentalContract` locale usa campi snake_case e converte `rate`, durata e frequenza secondo convenzioni v1. Il core v2 usa nomi camelCase, rate in Stardust e durate in secondi. Serve un adapter esplicito, con conversioni documentate e senza passare direttamente gli oggetti SDK al frontend.

### Flussi di scrittura

`list`, `rent`, `cancel` e `delist` non possono essere considerati compatibili finché non vengono confrontati account, argomenti, PDA, token account e programmi CPI. In particolare, v2 introduce stati queued/active, cancellation delay, reservation e borrower state: il semplice campo locale `current_rental_state` non rappresenta più tutto il ciclo di vita.

### Dipendenze e runtime

Il core aggiunge `@solana/kit`, pacchetti Codama e `@sly-rentals/vault`. Il progetto usa già `web3.js`, quindi l'entry point `legacy` è il candidato meno invasivo, ma va verificato con il bundling ESM del progetto. Non è opportuno importare l'entry point root ovunque prima di avere una smoke test runtime riproducibile.

## Fattibilità

### Fattibile

La migrazione è tecnicamente fattibile e il core riduce il rischio di mantenere decoder e discriminator manuali. La strategia più prudente è mantenere il servizio e l'API locali, usando il core come boundary per decode, PDA e istruzioni.

### Non è un aggiornamento drop-in

La differenza di program ID, IDL e layout rende improbabile una sostituzione file-per-file. Un aggiornamento parziale potrebbe mescolare dati v1 e v2, generando contratti invisibili, filtri errati o transazioni rifiutate on-chain.

### Stima qualitativa

- **Bassa complessità:** importare l'IDL v2 come riferimento e validare rete/program ID.
- **Media complessità:** migrare lettura di ContractState/RentalState e adapter API, con gestione cache separata.
- **Alta complessità:** migrare list/accept/cancel/delist e supportare contratti pre-v2 tramite `migrateContract`.
- **Alta complessità:** conservare compatibilità simultanea v1/v2 nei dati e nei flussi di scrittura.

## Percorso consigliato

1. **Identificare il target on-chain.** Confermare rete, program ID v2, genesis hash e se i contratti esistenti sono v1 migrabili.
2. **Congelare il contratto dati attuale.** Definire un adapter v2 -> `RentalContract`, senza cambiare subito le route pubbliche.
3. **Sostituire il decode manuale.** Usare gli account/codec del core per ContractState e RentalState; mantenere il decoder SAGE/Fleet separato finché non esiste una fonte v2 equivalente.
4. **Separare cache v1/v2.** Includere network, program ID e layout nella chiave o nei metadati.
5. **Migrare prima la lettura.** Verificare conteggi, pubkey, rate, durate e stato contro RPC e IDL.
6. **Migrare le scritture una alla volta.** Partire da `createContract`, poi `acceptRental`, quindi cancel/close/release; confrontare ogni transazione simulata con una transazione ufficiale.
7. **Gestire i contratti pre-v2.** Usare l'indirizzamento raw e `migrateContract` solo dopo aver verificato autorizzazioni e account richiesti.
8. **Aggiungere test di fixture.** Usare buffer/account reali anonimizzati per discriminator, decode, PDA, instruction data e conversioni API.

## Verdetto

L'installazione è necessaria per adottare il nuovo SDK, ma non è sufficiente per aggiornare la sezione rental. La verifica on-chain ha risolto la discrepanza: `SRSLYxc...` è il target v2, mentre `SRSLY1...` resta il programma legacy. La migrazione è fattibile ma richiede almeno un nuovo boundary di decode, un adapter API, cache separata e la ricostruzione dei flussi di scrittura v2.

## Primo passo implementato

È stato aggiunto `src/backend/rental/srslyV2Adapter.ts`. L'adapter:

- accetta `ContractState` e `RentalState` già decodificati dal core;
- converte i nomi camelCase v2 nella shape snake_case di `RentalContract`;
- converte Stardust in ATLAS e secondi in giorni per mantenere la compatibilità API;
- conserva i valori v2 esatti nei campi opzionali;
- distingue rental attivo, queued, disponibile e cancellato;
- non esegue RPC e non espone tipi `@solana/kit` alla UI.

Il servizio v1 non è ancora stato sostituito. Il program ID v2 è stato confermato on-chain, ma l'integrazione backend deve usare il subpath CommonJS/compatibile oppure un wrapper locale; l'entry point ESM del pacchetto non è utilizzabile direttamente in Node 20. L'integrazione successiva dovrà passare i record v2 all'adapter e invalidare la cache legacy.

# Analisi Tecnico-Architetturale: Migrazione Rental SRSLY v1 -> v2 (Next-Gen)

**Progetto:** SaeMobile / SAE Server  
**Stato Attuale:** `@sly-rentals/core` v5.4.0 installato  
**Esito Valutazione:** Non sufficiente per la migrazione automatica  

---

## 1. Sintesi Esecutiva

L'esecuzione del comando `npm i @sly-rentals/core` aggiunge al progetto l'SDK ufficiale per interagire con i contratti **SRSLY Next-Gen (v2)**, ma **non aggiorna automaticamente** la sezione rental del sistema. 

L'architettura attuale del progetto si basa su:
* Decodifica manuale dei buffer e offset di memoria Anchor su Program ID v1 (`SRSLY1...`).
* Derivazione rigida delle PDA per i contratti legacy.
* Flussi di calcolo basati su intervalli giornalieri (00:00 UTC).

Il nuovo protocollo SRSLY v2 adotta un nuovo **Program ID (`SRSLYxc...`)**, un nuovo **IDL (v0.4.0)**, un conteggio della durata **al secondo** e un modello di gestione delle transazioni basato sulla suite moderna `@solana/kit`. 

Mantenere la sola installazione del pacchetto senza ristrutturare l'adattatore backend provocherà errori di decodifica (*deserialization panic*) o il puntamento a contratti dismessi/vuoti.

---

## 2. Matrice di Comparazione Tecnico-Funzionale

| Componente / Caratteristica | Architettura Attuale (Legacy v1) | Nuova Architettura (SRSLY v2 Core) | Impatto nel Progetto |
| :--- | :--- | :--- | :--- |
| **Program ID Solana** | `SRSLY1...` | `SRSLYxc...` | **Bloccante**: Da aggiornare costanti e derivazioni PDA. |
| **IDL & Codegen** | Anchor IDL locale (Legacy) | Codama / `@solana/kit` IDL 0.4.0 | **Alto**: I tipi e i layout degli account sono incompatibili. |
| **Decoding & Parsing** | Decoder manuale con offset e buffer fissi | SDK integrato / Tipi auto-generati | **Alto**: Necessario nuovo layer di deserializzazione. |
| **Unità di Tempo** | Giorni interi (finestre fisse UTC) | **Al secondo** (`stardust` e tempo reale) | **Medio**: Modifica ai calcoli di resa/costo nel backend/UI. |
| **Gestione Token ATA** | Gestiti e forniti dal wallet utente | Gestiti dal programma (*Program-managed*) | **Medio**: Semplificazione delle transazioni di noleggio. |
| **Reservations / Bidding** | Assente (First-Come First-Served) | Sistema di coda ad asta (ATLAS / Loyalty) | **Funzionale**: Nuova feature opzionale da integrare. |

---

## 3. Analisi della Fattibilità e Criticità

### 3.1 Compatibilità del Runtime ESM / Node.js
Il pacchetto `@sly-rentals/core` v5.4.0 fa un uso esteso di moduli ES moderni e dipendenze `@solana/kit`. In Node 20.19.5 l'import ESM del core e del subpath `legacy` fallisce su directory interne; il bundle CommonJS del subpath `legacy` funziona. Il backend dovrà quindi isolare l'SDK in un wrapper CommonJS compatibile con il processo di build attuale, oppure attendere una correzione del packaging ESM.

### 3.2 Coesistenza dei Contratti (V1 vs V2)
Sulla rete Solana saranno presenti sia i vecchi contratti in esaurimento/chiusura (v1) sia i nuovi contratti attivi (v2). La struttura rental del progetto deve prevedere un meccanismo di **fallback / doppio adapter** se si vuole consentire agli utenti di visualizzare o riscattare rental storici stipulati sulla v1.

---

## 4. Roadmap di Migrazione Incrementale Consigliata

Per evitare interruption di servizio e completare la migrazione in modo sicuro senza blocchi al deployment, si consiglia una migrazione in 4 fasi:

### Fase 1: Adapter & Layer di Astrazione (Backend)
* Creare un'interfaccia `RentalAdapter` astratta nel backend per isolare la logica di business dai dettagli del contratto on-chain.
* Implementare `SrslyV2Adapter` sfruttando le chiamate messe a disposizione da `@sly-rentals/core`.

### Fase 2: Aggiornamento Decoder e Data Fetching
* Sostituire l'uso di offset rigidi sui buffer e Anchor IDL v1 con i decodificatori ufficiali del pacchetto `@sly-rentals/core` per gli account di tipo `RentalState`, `Reservation`, ecc.
* Mappare i valori `stardust` ($100.000.000\text{ stardust} = 1\text{ ATLAS}$) verso la numerica utilizzata dall'applicazione.

### Fase 3: Costruzione delle Transazioni
* Aggiornare la sezione di orchestrazione delle transazioni per la stipula, cancellazione e riscatto del rent per richiamare i nuovi metodi del programma v2.

### Fase 4: Collaudo ed Esposizione API
* Eseguire test di lettura/decodifica sugli account di mainnet della v2.
* Esporre la nuova risposta normalizzata alla dashboard/client mobile.

---

## 5. Conclusione

L'installazione di `@sly-rentals/core` costituisce **solo il prerequisito di dipendenza**. La migrazione è **assolutamente fattibile**, ma richiede un intervento mirato sul layer di decodifica, la mappa delle PDA, la gestione del Program ID e la logica di calcolo del tempo.
