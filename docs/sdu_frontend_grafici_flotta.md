# SDU Frontend: caricamento sezione e grafici orizzontali per flotta

## Obiettivo

Definire una implementazione frontend per la sezione SDU che:

1. carica i dati da `/api/fleet-chart-data`;
2. mostra un grafico a colonne verticali per ogni flotta;
3. resta coerente con il pattern attuale di toggle/cache view.

Il frontend dovrà raccogliere i fleetId di tutte le flotte appartenenti al profileId connesso (tutti dati già conosciuti e presenti).

## Input API atteso

Richiesta esempio:

```json
{
  "fleetIds": ["JBLjNQgV4ygFQhAF66hTyTDVyouCgU4nkBDtP1SNEEX5"],
  "days": 10
}
```

Campi utili della risposta:

- `fleets[]`
- `fleets[].fleetId`
- `fleets[].fleetName`
- `fleets[].series[]`
- `fleets[].series[].date`
- `fleets[].series[].sduSum`
- `fleets[].series[].scanCount`
- `fleets[].series[].findCount`
- `fleets[].series[].scanFindRatio`
- `fleets[].series[].avgScannedPercent`

## KPI consigliato per il grafico

Per la prima versione: usare `sduSum` come metrica primaria (barre verticali per giorno).

Motivo:

- è il dato SDU più diretto;
- consente confronto immediato tra giorni nella stessa flotta.

Estensione fase 2:

- selettore KPI: `sduSum | scanCount | findCount | scanFindRatio | avgScannedPercent`.

## UX proposta (minimale)

Dentro `sduProgramResults`:

1. Header sezione:
   - titolo `SDU Program` ed icona `/home/luca/sae/frontend/src/assets/icons/sduProgramBlack.png`
   - sottotitolo con `days` e numero flotte processate
2. Stato caricamento:
   - messaggio `Loading SDU charts...`
3. Lista grafici:
   - una card per flotta
   - ogni card contiene titolo flotta e canvas chart
4. Stato vuoto:
   - `No SDU data for selected fleets.`
5. Stato errore:
   - `Failed to load SDU data: ...` + messaggio errore specifico richiesta api

## Scelta tecnica grafico

Nel progetto c'e gia' rendering chart in `frontend/src/services/charts.ts` con `Chart` globale.

Il grafico deve essere simile ad hourly fee.

## Flusso frontend consigliato

1. L'utente seleziona tab SDU.
2. Se esiste cache view SDU aggiornata, mostra subito cache.
3. In background esegue fetch dati SDU (opzionale in fase 1; obbligatorio in fase 2).
4. Render delle card flotta.
5. Aggiorna cache SDU con il nuovo DOM.

## Contratto dati FE (proposto)

```ts
type SduPoint = {
  date: string;
  sduSum: number;
  scanCount: number;
  findCount: number;
  scanFindRatio: number;
  avgScannedPercent: number;
};

type SduFleetSeries = {
  fleetId: string;
  fleetName: string;
  lastSeen?: string;
  visible?: boolean;
  series: SduPoint[];
};
```

## File impattati (proposta)

1. `frontend/src/ui/elements/sduProgram_playload.ts`
   - orchestrazione render SDU
   - fetch endpoint SDU
   - costruzione card per flotta
2. `frontend/src/services/charts.ts`
   - helper chart barre verticali
3. `frontend/src/ui/styles/sduProgram_playload.css` (nuovo)
   - layout card, header, empty/error state
4. `frontend/src/main.ts`
   - import CSS SDU
5. `frontend/src/services/api.ts`
   - hook refresh/cache view SDU coerente con ciclo analisi

## Strategia implementativa minima

Fase 1 (rapida):

1. Mantenere struttura SDU gia' attiva nello switch.
2. Aggiungere fetch a `/api/fleet-chart-data` quando si apre SDU.
3. Renderare solo `sduSum` in barre verticali per ciascuna flotta.
4. Nessun filtro avanzato.

Fase 2:

1. Aggiungere selettore giorni (3/7/14).
2. Aggiungere selettore KPI.
3. Supportare refresh manuale + age cache.

## Criteri di accettazione

1. Sezione SDU esegue fetch con payload `{ fleetIds, days }`.
2. Per ogni flotta in risposta viene mostrato un grafico verticale.
3. L'asse X contiene le date della serie; l'asse Y i valori `sduSum`.
4. Gestione completa di loading, empty ed error state.
5. Nessuna regressione su tab `fee/resource/rental`.

## Rischi e note

- Se `fleetIds` e' vuoto, serve fallback (messaggio guida o derivazione dalle flotte analizzate).
- Con molte flotte, il render sincrono puo' appesantire la vista: utile batching o limit iniziale.
- Per mantenere diff minimo, evitare subito refactor globale del sistema chart.
