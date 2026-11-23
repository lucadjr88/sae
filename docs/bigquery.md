# Guida: integrare Dune e BigQuery nel tuo backend TS/JS

Ti do una guida end-to-end, pensata per un backend Node/TS già esistente che fa già girare una pipeline RPC. L'obiettivo è **aggiungere uno strato "bulk data"** che sostituisca le `getTransaction` massive mantenendo la RPC solo per il delta recente.

---

## 0. Decision matrix rapida

| Criterio | Dune | BigQuery |
|---|---|---|
| Dataset Solana pronto | ✅ `solana.transactions`, `solana.instructions`, `solana.account_activity` | ⚠️ dataset pubblico deprecato |
| Setup | API key, 5 min | Service account GCP, 15-30 min |
| Query parametriche con cache | ✅ `getLatestResult` | ❌ ogni query paga |
| Free tier pratico per 1 wallet | ✅ (2500 crediti/mese bastano) | ⚠️ occhio a scan TB |
| Latenza dati | 5-15 min di lag | variabile |
| Adatto a backfill 24h | **✅ la scelta** | solo se hai ETL proprio |
| Adatto a real-time | ❌ | ❌ |

**Consiglio**: implementa **Dune come primary** e **BigQuery come fallback opzionale**, dietro un'interfaccia comune. Così se Dune ha un incidente hai un piano B.

Le due integrazioni sono simili per forma: entrambe sono **`async fetch(query, params) => rows`** da mettere di fronte alla tua `RpcPool` esistente.

---

## 1. Prerequisiti comuni

```bash
# Dune
npm i @duneanalytics/client-sdk

# BigQuery
npm i @google-cloud/bigquery

# Cache + rate limiting (li avevi già per la pool, riusa)
npm i lru-cache p-limit zod
```

Variabili d'ambiente necessarie:

```bash
# .env
DUNE_API_KEY=...
DUNE_QUERY_ID=1234567       # saved query id (lo crei in step 3)
SAGE_PROGRAM_ID=SAGE...

# BigQuery (opzionale, solo se attivi il fallback)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_PROJECT_ID=my-project
```

**Regola d'oro**: le API key stanno **solo** nel backend, mai esposte al browser. Il tuo endpoint `/api/tx-public` le chiama server-side.

---

## 2. Dune — setup lato account

### 2.1 Crea la query saved

Nell'editor Dune crea una query e chiamala es. `sage_wallet_activity_24h`. Parametrizza il wallet con `{{wallet}}` (tipo `text`). Schema salvato:

```sql
-- sage_wallet_activity_24h
-- param: wallet (text)
-- param: program (text) - opzionale, default SAGE program
WITH window_start AS (
  SELECT now() - interval '24' hour AS ts
)
SELECT
  i.tx_signature,
  i.block_time,
  i.slot,
  i.outer_instruction_index,
  i.inner_instruction_index,
  i.executing_account,
  i.accounts,
  i.data,
  i.tx_signer,
  i.tx_success
FROM solana.instructions i
WHERE i.executing_account = {{program}}
  AND i.block_time > (SELECT ts FROM window_start)
  AND (
        i.tx_signer = {{wallet}}
     OR contains(i.accounts, from_base58({{wallet}}))
      )
ORDER BY i.block_time DESC
```

⚠️ **Verifica i nomi colonna**: su Dune a volte `executing_account` è `program_id`. Fai `select * from solana.instructions limit 1` e adatta. Se `accounts` è `array<varbinary>` usa `contains(i.accounts, from_base58({{wallet}}))`, se è `array<varchar>` usa `contains(i.accounts, {{wallet}})`.

Se il wallet ha **solo** tx SAGE (come mi hai detto), puoi semplificare rimuovendo il ramo `accounts` — metti `i.tx_signer = {{wallet}}` e basta. Costa meno.

### 2.2 Note sui costi Dune

- `runQuery` esegue **ogni volta** che la chiami → consuma crediti.
- `getLatestResult` **non esegue**: legge l'ultima esecuzione in cache.
- **Pattern ottimale**: cron ogni 10 min che refresha la query + `getLatestResult` per il frontend → **0 crediti per visita**.
- Free tier: **~2500 crediti/mese**. Un execution `medium` su query piccola = ~10-20 crediti. 10 refresh/ora × 24h × 30gg = 7200 esecuzioni → **troppo**. Refresh ogni 10 min = **4320/mese**, ancora tanto. **Refresh ogni 30 min** = 1440 esecuzioni → entra. Meglio: **refresh on-demand con cache 10 min lato tuo** + debounce.
- Alternativa gratis: crea la query e imposta "Materialized view / scheduled" dal piano Dune se hai crediti.

### 2.3 API key

Dune → settings → `Create new key`. Salvala in `DUNE_API_KEY`.

---

## 3. Backend — modulo Dune (production-grade)

Crea `src/services/dune.service.ts`:

```ts
import { DuneClient } from '@duneanalytics/client-sdk';
import { z } from 'zod';

// Schema di output — quello che il tuo backend aspettava da getTransaction
export const SageIxRowSchema = z.object({
  tx_signature: z.string(),
  block_time: z.coerce.date(),
  slot: z.coerce.number(),
  outer_instruction_index: z.coerce.number(),
  inner_instruction_index: z.number().nullable(),
  executing_account: z.string(),
  accounts: z.array(z.string()),
  data: z.string(), // base64 — lo decodifichi col tuo Borsh/Anchor
  tx_signer: z.string(),
  tx_success: z.boolean(),
});
export type SageIxRow = z.infer<typeof SageIxRowSchema>;

export interface DuneQueryParams {
  /** finestra temporale */
  hours?: number;
  /** wallet del player */
  wallet: string;
  /** override del program id (default: env) */
  programId?: string;
}

export class DuneService {
  private client: DuneClient;
  private queryId: number;
  private programId: string;

  constructor(opts: { apiKey: string; queryId: number; programId: string }) {
    this.client = new DuneClient(opts.apiKey);
    this.queryId = opts.queryId;
    this.programId = opts.programId;
  }

  /** Esegue la query saved (consuma crediti). */
  async execute({
    wallet,
    programId,
  }: DuneQueryParams): Promise<SageIxRow[]> {
    const job = await this.client.runQuery({
      queryId: this.queryId,
      queryParameters: {
        wallet,
        program: programId ?? this.programId,
      },
    });

    if (!job.execution_id) throw new Error('Dune: no execution_id');

    const results = await this.waitForResults(job.execution_id);
    return this.parseRows(results);
  }

  /** Recupera l'ultimo risultato senza rieseguire (0 crediti extra). */
  async latest(params: DuneQueryParams): Promise<SageIxRow[]> {
    const res = await this.client.getLatestResult({
      queryId: this.queryId,
      // alcuni SDK accettano i parametri ma la query deve essere stata eseguita coi medesimi
    });
    return this.parseRows(res);
  }

  private async waitForResults(
    executionId: string,
    timeoutMs = 60_000
  ): Promise<any> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const status = await this.client.getExecutionStatus({
        jobId: executionId,
      });
      const state = (status as any).state as
        | 'QUERY_STATE_PENDING'
        | 'QUERY_STATE_EXECUTING'
        | 'QUERY_STATE_COMPLETED'
        | 'QUERY_STATE_FAILED'
        | 'QUERY_STATE_CANCELLED';

      if (state === 'QUERY_STATE_COMPLETED') {
        return this.client.getExecutionResults({ jobId: executionId });
      }
      if (
        state === 'QUERY_STATE_FAILED' ||
        state === 'QUERY_STATE_CANCELLED'
      ) {
        throw new Error(`Dune execution ${state}: ${executionId}`);
      }

      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`Dune execution timeout: ${executionId}`);
  }

  private parseRows(raw: any): SageIxRow[] {
    const rows = raw?.result?.rows ?? [];
    return rows.map((r: unknown) => SageIxRowSchema.parse(r));
  }
}
```

Note importanti:

- **`block_time`** spesso arriva come stringa ISO → `z.coerce.date()` la converte.
- **`accounts`** può arrivare come `string[]` o `{ value: string[] }` in alcuni casi — se hai questo problema aggiungi un `z.preprocess` che unwrappa.
- **`waitForResults`** polling ogni 1500ms: non metterlo più basso, Dune throttla.
- **Timeout 60s**: se la tua query è pesante può non bastare. Alza a 120s ma non di più: meglio accorciare la query.

---

## 4. Cache layer (indispensabile per la fattura Dune)

`src/services/query-cache.ts`:

```ts
import { LRUCache } from 'lru-cache';

type CacheEntry<T> = { data: T; fetchedAt: number };

export class QueryCache {
  private lru: LRUCache<string, CacheEntry<unknown>>;
  constructor(private ttlMs: number, max = 500) {
    this.lru = new LRUCache({ max, ttl: this.ttlMs });
  }

  get<T>(key