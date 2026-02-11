# Uso unificato di RpcPoolManager

Scopo: fornire regole e snippet riutilizzabili perché tutte le parti del codice usino lo stesso pool RPC (`RpcPoolManager`) evitando istanze `new Connection(...)` sparse e creazione incoerente di `cache/<PROFILEID>/rpc-pool.json`.

Regole principali
- Non creare mai `Connection` direttamente in nuove funzioni: usare sempre `RpcPoolManager.pickRpcConnection(profileId)`.
- Tutte le funzioni che eseguono chiamate RPC devono ricevere un `profileId` (o dedurlo dal contesto) e passarlo a `RpcPoolManager`.
- Dopo aver ottenuto `{ connection, release }` chiamare sempre `release(...)` nel blocco `finally` o dopo successo/errore con il corretto `opts`:
  - `release({ success: true, latencyMs })` su successo
  - `release({ success: false, errorType: '429' })` su 429 o `release({ success: false })` su altri errori
- Per forzare aggiornamento pool usare `pruneRpcPool(profileId, true)` (quando serve)
- Evitare `loadOrCreateRpcPool(...)[0]` + `new Connection(endpoint)`; questo bypassa health/backoff/concurrency.

Percorso cache
- Il pool deve essere salvato in `cache/<PROFILEID>/rpc-pool.json` gestito da `RpcPoolManager`.
- Tutte le funzioni che salvano risultati devono usare `cache/<PROFILEID>/...` (es.: `cache/<PROFILEID>/rented-fleets/`).

Pattern consigliati (TypeScript)

1) Pattern base per operazioni RPC (getAccountInfo, getProgramAccounts, ecc.)

```typescript
import { RpcPoolManager } from '../utils/rpc/rpc-pool-manager';

async function withConnection<T>(profileId: string, fn: (conn: any) => Promise<T>): Promise<T> {
  let pick: any = null;
  try {
    pick = await RpcPoolManager.pickRpcConnection(profileId);
    const { connection, release } = pick;
    const res = await fn(connection);
    release({ success: true });
    return res;
  } catch (e) {
    if (pick && pick.release) {
      try { pick.release({ success: false }); } catch {};
    }
    throw e;
  }
}
```

Esempio: leggere account

```typescript
await withConnection(profileId, async (connection) => {
  const acc = await connection.getAccountInfo(new PublicKey(accountPubkey));
  // ...
});
```

2) Eseguire `getProgramAccounts` con filtro memcmp

```typescript
await withConnection(profileId, async (connection) => {
  const accounts = await connection.getProgramAccounts(programPubkey, {
    filters: [{ memcmp: { offset: OWNER_PROFILE_OFFSET, bytes: profileId }}],
    commitment: 'confirmed'
  });
  return accounts;
});
```

3) Callbacks che richiedono retry/prune

```typescript
// Forza prune quindi riprova (es. double-check)
const { pruneRpcPool } = await import('../utils/rpc/rpc-pool-manager');
await pruneRpcPool(profileId, true);
// poi use withConnection(...) per operazioni che leggono le signatures
```

Esempi concreti in repo
- `src/utils/fetchProfileFleets.ts` e `src/utils/fetchProfileRentedFleets.ts` seguono il pattern corretto: chiamano `RpcPoolManager.pickRpcConnection(profileId)` e salvano in `cache/<PROFILEID>/fleets` o `rented-fleets`.
- `src/utils/fetchSolanaAccountInfo.ts` è stato aggiornato per usare `RpcPoolManager`.

Best practices
- Passare sempre `profileId` come primo argomento alle utility che chiamano RPC.
- Centralizzare funzionalità comuni (ad es. `withConnection`) in `src/utils/solanaRpc.ts` o similare.
- Loggare sempre `profileId` quando si crea o pruna il pool (aiuta a diagnosticare file `cache/<PROFILEID>/...` creati con id errati).

Regole di importazione
- Usare import dinamico solo se strettamente necessario per compatibilità ESM; preferire import statici per i moduli interni (es. `import { RpcPoolManager } from './rpc/rpc-pool-manager'`).

Controlli da eseguire quando si introduce una nuova funzione RPC
1. La funzione accetta `profileId` (o ottiene da contesto chiaro).
2. Usa `RpcPoolManager.pickRpcConnection(profileId)` per ottenere `connection` e `release`.
3. Chiama `release(...)` in tutti i casi (success/failure).
4. Non scrive manualmente `cache/<PROFILEID>/rpc-pool.json`.
5. Se serve forzare aggiornamento pool, usa `pruneRpcPool(profileId, true)`.

Sezione FAQ rapida
- Q: Perché non usare `new Connection(endpoint)`?  
  A: Bypassa la logica di health/backoff e la gestione concorrente; può creare file `rpc-pool.json` su profileId sbagliati se usato con code path differenti.

---
Documento creato per allineare il team all'uso di `RpcPoolManager`. Aggiornare questo file quando si cambiano convenzioni sul pool o sul formato della cache.
