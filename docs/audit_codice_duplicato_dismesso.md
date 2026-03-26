# Audit: Codice Duplicato e Dismesso

Data: 2026-03-13 | Stato: **PULIZIA COMPLETATA**

> Tutti i file elencati come "mossi in trash" sono stati spostati in `trash/` con la struttura di directory originale preservata. Il build è pulito post-pulizia (unico errore residuo: `@solana/wallet-adapter-backpack` — dipendenza npm mancante, pre-esistente e non correlata).

---

## 1. Script duplicato: `scripts/run_decoder_on_cache`

| File | Stato |
|------|-------|
| `scripts/run_decoder_on_cache.cjs` | Attivo |
| `scripts/run_decoder_on_cache.js` | **Duplicato** |

I due file sono quasi identici — l'unica differenza è il nome del file nel messaggio di usage (`Usage: node run_decoder_on_cache.cjs` vs `.js`). Il file `.cjs` è la versione canonica; il `.js` è ridondante.

---

## 2. Utility frontend doppione: `services/utils.ts` vs `utils/utils.ts`

| File | Importa da |
|------|------------|
| `frontend/src/services/utils.ts` | `@/services/common` |
| `frontend/src/utils/utils.ts` | `@/types/common` |

Entrambi esportano le stesse quattro funzioni:
- `copyToClipboard`
- `inferRecipeName`
- `inferMaterialLabel`
- `normalizeOpName`

Differenze puntuali:
- `utils/utils.ts` ha un `console.log('inferRecipeName burns:', burns)` di debug nell'implementazione di `inferRecipeName` (riga 19).
- `services/utils.ts` marca il parametro `_burns` come inutilizzato.

Il codebase importa le due versioni in modo inconsistente da file diversi:

| File importante | Importa da |
|-----------------|------------|
| `ui/elements/resource_playload.ts` | `@/services/utils` |
| `ui/elements/fees_playload.ts` | `@/services/utils` |
| `services/api.ts` | `@/services/utils` |
| `ui/renderDetails.ts` | `@/utils/utils` |
| `services/fleet-operations.ts` | `@/utils/utils` |

---

## 3. Definizioni di tipo doppione: `services/common.d.ts` vs `types/common.d.ts`

| File |
|------|
| `frontend/src/services/common.d.ts` |
| `frontend/src/types/common.d.ts` |

Contenuto identico in entrambi i file:
```ts
export type DecodedInstruction = any;
export type BurnedMaterial = any;
export type ClaimedItem = any;
export type MaterialEntry = any;
```
La differenza rilevata dal diff è solo una riga vuota finale nel file `services/common.d.ts`. Ogni file viene importato da una delle due versioni dell'utility duplicata (punto 2).

---

## 4. Wrapper inutili nella catena fleet

### `src/utils/getFleets.ts`
Thin-wrapper attorno a `fetchProfileFleets`. Aggiunge solo un try/catch e un `console.log`. Usato solo da `src/analysis/debug/getFleets.ts`.

```ts
// getFleets.ts — unica logica aggiunta: try/catch attorno a fetchProfileFleets
export async function getFleetsUtil(profileId: string): Promise<any[]> {
  try {
    return await fetchProfileFleets(profileId) || [];
  } catch (e) { ... }
}
```

### `src/utils/getRentedFleets.ts`
One-liner wrapper attorno a `fetchProfileRentedFleets`. Nessuna logica aggiuntiva.

```ts
// getRentedFleets.ts — è solo un alias
export async function getRentedFleetsUtil(profileId: string): Promise<any[]> {
  return await fetchProfileRentedFleets(profileId);
}
```

---

## 5. Stub non implementati che restituiscono dati vuoti

I seguenti file in `src/utils/` sono stub con `TODO` e restituiscono sempre dati vuoti. Non hanno mai avuto implementazione reale.

| File | Return value |
|------|-------------|
| `src/utils/fetchFleets.ts` | `[]` |
| `src/utils/fetchRentedFleets.ts` | `[]` |
| `src/utils/dumpFleets.ts` | `{ ownedFleets: [], rentedFleets: [] }` |
| `src/utils/dumpProfileHex.ts` | `{ outPath: '', length: 0 }` |
| `src/utils/scanProfileOwner.ts` | vedi TODO |
| `src/utils/refreshAllowedWallets.ts` | vedi TODO |

`fetchFleets` e `fetchRentedFleets` sono stub che coesistono con le implementazioni reali `fetchProfileFleets` e `fetchProfileRentedFleets` (con parsing RPC effettivo).

---

## 6. Index file vuoti / solo commento

| File | Contenuto |
|------|-----------|
| `src/utils/index.ts` | `// TODO: implementare utility` |
| `src/decoders/index.ts` | `// TODO: implementare funzioni di decodifica` |
| `src/market/index.ts` | `// TODO: implementare se necessario` |
| `src/analysis/saveProfileMetadata.ts` | File completamente vuoto (0 byte) |

Nessuno di questi viene importato da altri file. Occupano spazio e generano confusione.

---

## 7. Codice legacy in `frontend/src/services/wallet.ts`

`mobile_wallet.ts` contiene esplicitamente, a partire dalla riga 99:
```
// VECCHIO CODICE (src/services/wallet.ts) - NON USARE, SOLO PER CONFRONTO
```

Tuttavia `wallet.ts` è **ancora importato attivamente** da `frontend/src/main.ts` (riga 17):
```ts
import { Wallet } from '@/services/wallet';
```

La classe `Wallet` in `wallet.ts` ha 130+ righe (costruttore, connect, disconnect, signMessage, showWalletModal). Se `mobile_wallet.ts` è la versione corrente, `wallet.ts` è dead code che però rimane nell'albero di compilazione.

---

## 8. Script temporaneo: `scripts/tmp_deposit_audit.cjs`

- Nome con prefisso `tmp_` — indica uso one-shot / temporaneo.
- 139 righe con un `profileId` hardcodato: `CpnGr2beMA1HLUe5TSkNj4NqyAsY72VHaWHFrB6Pj7Zu`.
- Non referenziato da `package.json` né da altri script.
- Probabilmente un audit manuale cristallizzato nel repo.

---

## 9. Conflitto target TypeScript tra tsconfig

| File | `target` | `moduleResolution` |
|------|----------|--------------------|
| `tsconfig.json` (root/backend) | `ES2020` | `node` |
| `frontend/tsconfig.json` | `ES2022` | `bundler` |

Non è una duplicazione, ma un'inconsistenza: codice condiviso tra i due layer potrebbe comportarsi diversamente a seconda del compilatore usato.

---

## Riepilogo delle azioni suggerite

| Priorità | Azione | File coinvolti |
|----------|--------|---------------|
| Alta | Eliminare script duplicato | `scripts/run_decoder_on_cache.js` |
| Alta | Unificare utility frontend duplicata | `services/utils.ts` + `utils/utils.ts` → scegliere uno, aggiornare tutti gli import |
| Alta | Unificare tipo duplicato | `services/common.d.ts` + `types/common.d.ts` → mantenere solo `types/common.d.ts` |
| Media | Rimuovere wrapper inutili | `src/utils/getFleets.ts`, `src/utils/getRentedFleets.ts` |
| Media | Rimuovere stub vuoti | `fetchFleets.ts`, `fetchRentedFleets.ts`, `dumpFleets.ts`, `dumpProfileHex.ts`, `scanProfileOwner.ts`, `refreshAllowedWallets.ts` |
| Media | Eliminare index file vuoti | `src/utils/index.ts`, `src/decoders/index.ts`, `src/market/index.ts`, `src/analysis/saveProfileMetadata.ts` |
| Media | Chiarire stato `wallet.ts` | Decidere se dismettere `services/wallet.ts` o rimuovere il blocco legacy da `mobile_wallet.ts` |
| Bassa | Eliminare script temporaneo | `scripts/tmp_deposit_audit.cjs` |
| Bassa | Allineare target TS | `tsconfig.json` vs `frontend/tsconfig.json` |
