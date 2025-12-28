# Piano di Modularizzazione: src/utils/rpc/pool-connection.ts

## Obiettivo

Ridurre la complessità e migliorare la manutenibilità del file più grande del backend, suddividendolo in moduli tematici e facilmente testabili.

## Analisi delle Responsabilità Attuali
- Gestione pool RPC (selezione endpoint, health, retry, backoff)
- Wrapper Connection API (getTransaction, getAccountInfo, ecc.)
- Logging e metriche
- Opzioni e tipi custom

## Moduli Proposti

1. **pool-connection-types.ts**
   - Tutte le interfacce e i tipi (es: RpcOperationOptions)

2. **pool-connection-logging.ts**
   - Funzioni di logging e metriche (es: logAggregatedStats)

3. **pool-connection-core.ts**
   - Logica di pool, retry, timeout, error handling
   - Funzioni: executeWithPool, executeWithTimeout, classifyError

4. **pool-connection-api.ts**
   - Solo i metodi wrapper delle API Solana (getTransaction, getAccountInfo, ecc.), che usano il core

5. **pool-connection-factory.ts**
   - Funzione createRpcPoolConnection

6. **pool-connection.ts**
   - Classe/factory principale che importa e re-esporta tutto

## Step Operativi (AI-proof)

1. Estrarre tipi e interfacce in pool-connection-types.ts
2. Estrarre logAggregatedStats e funzioni di logging in pool-connection-logging.ts
3. Estrarre executeWithPool, executeWithTimeout, classifyError in pool-connection-core.ts
4. Spostare tutti i metodi wrapper API in pool-connection-api.ts, che importa il core
5. Lasciare solo la classe/factory principale in pool-connection.ts, che re-esporta tutto
6. Aggiornare gli import nei consumer
7. Validare la build dopo ogni step

## Note per evitare errori AI
- Procedere per step atomici: un file/modulo per volta
- Aggiornare sempre gli import nei consumer dopo ogni estrazione
- Validare la build dopo ogni refactoring
- Non cambiare la logica, solo spostare codice
- Annotare ogni step nel presente file .md

---


---


**Step 1 completato:** estratti tipi e interfacce in pool-connection-types.ts, aggiornato import in pool-connection.ts

**Step 2 completato:** estratte funzioni di logging in pool-connection-logging.ts, aggiornata la classe per usare l'import.


**Step 3 parziale:** estratte funzioni core pure (executeWithTimeout, classifyError) in pool-connection-core.ts. La funzione executeWithPool richiede refactoring aggiuntivo perché dipende da this; rimandata a uno step successivo.



**Step 4 completato:** estratti tutti i metodi API wrapper in pool-connection-api.ts.


**Step 5: Pianificazione refactoring executeWithPool**

1. Analizzare tutte le dipendenze di executeWithPool (poolManager, defaultConnection, opzioni di default, logging, ecc.)
2. Definire una struttura dati (es: PoolContext) che incapsuli tutte le dipendenze necessarie
3. Estrarre executeWithPool come funzione standalone in pool-connection-core.ts, che accetta PoolContext come primo argomento
4. Aggiornare la classe principale e i wrapper API per usare la nuova funzione
5. Validare la build e i test dopo ogni micro-step


---

**Analisi dipendenze di executeWithPool:**

- poolManager: gestisce il pool di endpoint, selezione, acquisizione slot, release, metriche, mark failure, ecc.
- defaultConnection: connessione fallback (opzionale, usata solo se fallbackToDefault)
- defaultTimeoutMs, defaultMaxRetries, defaultLogErrors: valori di default per le opzioni
- LOG_BATCH_SIZE, txCounter, lastLogTime: solo per logging, non necessari in executeWithPool
- nlog/logAggregatedStats: logging, già modularizzato

**Bozza PoolContext:**
```ts
export interface PoolContext {
   poolManager: RpcPoolManager;
   defaultConnection: Connection;
   defaultTimeoutMs?: number;
   defaultMaxRetries?: number;
   defaultLogErrors?: boolean;
}
```


**Step 5 completato:** estratta executeWithPool come funzione standalone in pool-connection-core.ts che accetta PoolContext come primo argomento.


**Step 6: Microazioni per aggiornamento finale**

1. Aggiornare la classe RpcPoolConnection per costruire e mantenere un PoolContext come proprietà privata
2. Aggiornare i metodi della classe per chiamare executeWithPool(ctx, ...) invece di this.executeWithPool(...)
3. Aggiornare i wrapper API per accettare PoolContext come primo argomento e documentare la dipendenza
4. Validare la build dopo ogni microazione
5. Annotare ogni microazione completata in questo file


**Microazione completata:** tutti i metodi della classe ora usano executeWithPool(this.poolContext, ...)


**Microazione completata:** wrapper API aggiornati per accettare PoolContext come primo argomento e documentata la dipendenza.

**Prossimo step:** validare la build e annotare la chiusura della modularizzazione.
