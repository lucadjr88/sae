# Analisi fasi lente backend SAGE (log 13/04/2026)

## Fasi più impegnative (time-consuming)

1. **fetchWalletTransactions** (Fase 2)
   - Esempio: wallet=9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY
   - 1019 transazioni elaborate, batch paralleli, numerosi 429 (rate limit) e retry
   - Cross-check tra endpoint multipli
   - Tempo impiegato: decine di secondi

2. **decodeInstructions** (Fase 3)
   - Decodifica 1021 transazioni, di cui 1019 SAGE ops
   - Parsing massivo, ma non il collo di bottiglia principale

3. **fetchWalletTransactions** (Fase 2, altro wallet)
   - Anche per wallet secondari, batch >1000 tx
   - Rate limit frequente, retry con backoff

4. **associateSageOpsToFleets** (Fase 6)
   - Matching 1019 SAGE ops con 9 fleet
   - Non critico, ma comunque iterativo

## Possibili migliorie

- **Ottimizzazione fetchWalletTransactions**
  - Ridurre richieste duplicate: migliorare caching e deduplica
  - Migliorare gestione pool endpoint: evitare endpoint "caldi" (troppe 429)
  - Adaptive concurrency: ridurre batch/concurrency su endpoint che throttling
  - Persistenza incrementale: salvare tx parziali per evitare ripetizioni

- **decodeInstructions**
  - Parallelizzare parsing se non già fatto
  - Saltare tx già decodificate (cache)

- **associateSageOpsToFleets**
  - Ottimizzare struttura dati per matching (es. indicizzazione per fleetPk)

- **General**
  - Logging tempi per ogni fase per profiling automatico
  - Alert su endpoint con troppi 429 per pruning dinamico

---

**Nota:** Il collo di bottiglia principale è la fase di fetch massivo delle transazioni, soprattutto in presenza di rate limit sugli endpoint RPC. Migliorare la resilienza e la distribuzione delle richieste può portare a riduzioni significative dei tempi totali.