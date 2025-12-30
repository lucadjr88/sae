
## IMPLEMENTATION STRATEGY — AI-OPTIMIZED (2025-12)

### PRINCIPI GUIDA
- Ogni funzione deve essere atomica, testabile, con input/output espliciti e validati.
- Evitare assunzioni implicite: ogni mapping, path, tipo e campo deve essere dichiarato e documentato.
- Nessun lazy coding: non saltare step, non "mockare" logica reale, non lasciare TODO non implementati.
- Prevenire allucinazioni: ogni pattern, mapping, edge case e test deve essere esplicito e referenziato.

### CHECKLIST OPERATIVA (step-by-step, no skip)
1. **Analisi e mappatura sub-account**
	- Funzione: `getSubAccountsForFleet(fleetKey): string[]`
	- Test: fleetKey valido/inesistente/cache corrotta
2. **Normalizzazione operazioni**
	- Funzione: `normalizeRawTxToWalletTx(rawTx): WalletTx`
	- Input: rawTx (file cache raw Solana)
	- Output: WalletTx `{ accountKeys, type, amount, ... }`
	- Test: estrazione corretta di cargo/subwarp/mining/altro da raw
	- Pattern: vedi mapping programId→opType sotto
3. **Aggregazione breakdown**
	- Funzione: `scanWalletTxsForSubAccounts(params): SubAccountBreakdown`
	- Input: params (fleetKey, subAccounts, opType, walletTxsPath, filter) su file normalizzati o array
	- Output: breakdown dettagliato e aggregato
	- Test: mock wallet-txs normalizzati, edge case multi-account
4. **Validazione input e tipi**
	- Enum OpType: validare ogni input, fallback su 'altro' se non riconosciuto
	- Test: input non valido, opType non supportato
5. **Serializzazione output**
	- Funzione: `serializeBreakdown(breakdown, format: 'json'|'csv')`
	- Test: breakdown reale e mock
6. **Test automatici e integrazione**
	- Ogni funzione atomica deve avere test unitari
	- Pipeline end-to-end su fleet reale e mock
	- Script di test: esecuzione automatica, report finale
7. **Gestione edge case e performance**
	- Gestire fleetKey non valido, cache mancante, wallet-txs corrotti
	- Ottimizzare: batch/stream, Set/Map, parallelizzazione
	- Log e report automatici su anomalie

### WARNING ANTI-LAZY CODING
- Non "mockare" la normalizzazione: implementare parsing reale delle istruzioni Solana.
- Non saltare la validazione dei campi estratti.
- Non lasciare test incompleti: ogni edge case deve essere coperto.

### PATTERN ANTI-HALLUCINATION
- Mapping programId→opType deve essere dichiarato in modo statico e referenziato in ogni test.
- Ogni funzione deve avere input/output documentati e validati.
- Ogni test deve usare dati reali o mock espliciti, mai generici.

### NOTE DI VALIDAZIONE
- Dopo ogni step, validare output con test automatici e confronto breakdown reale vs atteso.
- Loggare ogni anomalia o fallback su 'altro'.

---

### Struttura tecnica di WalletTx normalizzato
```ts
type WalletTx = {
	accountKeys: string[];
	type: 'cargo' | 'subwarp' | 'mining' | 'altro';
	amount: number; // opzionale, estratto da istruzioni token/cargo
	timestamp?: string;
	txid?: string;
	raw?: any; // opzionale, per debug
}
```

### Mapping programId → opType (esempi)
- Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk → 'cargo'
- SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE → 'subwarp'
- Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM → 'mining'
- Altri programId → 'altro'

### Pseudo-algoritmo di normalizzazione
1. Per ogni file raw tx:
	 - Estrarre tutti i programId dalle istruzioni principali e innerInstructions
	 - Se presente Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk → type = 'cargo'
	 - Se presente SAGE2HAwep... → type = 'subwarp'
	 - Se presente Point2iBvz... → type = 'mining'
	 - Altrimenti type = 'altro'
	 - Estrarre tutti gli accountKeys coinvolti (anche da innerInstructions)
	 - Estrarre amount se presente (es. istruzioni SPL Token, cargo, ecc.)
	 - Restituire oggetto WalletTx

### Edge case tecnici
- Istruzioni multiple con diversi programId: priorità a cargo/subwarp/mining
- Istruzioni custom o non decodificabili: fallback su 'altro' e log di warning
- File raw corrotti o incompleti: saltare e loggare errore

### Esempi di test automatici
- Test di normalizzazione su raw tx con solo cargo, solo subwarp, misti, nessun match
- Test di aggregazione breakdown su batch di WalletTx normalizzati
- Test di robustezza su file raw incompleti/corrotti

### Note di performance
- Batch processing: normalizzare in stream o batch per grandi volumi
- Uso di Set/Map per aggregazione rapida su sub-account

Logging dettagliato su mapping e anomalie

---

## Dipendenze e implicazioni della modifica

### Moduli e funzioni coinvolte
- `/src/decoders/scanWalletTxsForSubAccounts.ts`: funzione principale che consuma WalletTx normalizzati; dovrà accettare input normalizzato o integrare la normalizzazione.
- `/src/decoders/getSubAccountsForFleet.ts`: nessuna modifica diretta, ma la logica di breakdown dipende dalla corretta classificazione delle tx.
- `/src/decoders/OpType.ts`: assicurarsi che i nuovi type ('cargo', 'subwarp', 'mining', 'altro') siano gestiti e validati.
- `/src/decoders/serializeBreakdown.ts`: nessuna modifica diretta, ma il formato di output rifletterà la nuova classificazione.
- `/scripts/scan_subaccounts_rainbow_cargo.ts`: utile per validare la normalizzazione su batch di tx.

### Test e pipeline
- `/test/decoders/scanWalletTxsForSubAccounts.test.ts`: estendere per coprire i nuovi casi di normalizzazione e mapping.
- `/test/decoders/normalizeRawTxToWalletTx.test.ts`: nuovo test da aggiungere per la funzione di normalizzazione.
- Pipeline end-to-end: la modifica impatta tutti i test che partono da file raw e si aspettano breakdown coerente.

### API e backend
- `/src/routes/api/debug/fleet-breakdown.ts`: la risposta dell'endpoint cambierà, mostrando breakdown più accurati.
- `/public/app.js` e frontend: eventuali dashboard che leggono breakdown potrebbero mostrare nuovi type.

### Cache e dati
- `/cache/wallet-txs/`: la pipeline ora può lavorare direttamente su file raw, riducendo la necessità di pre-processing manuale.

### Effetti collaterali e rischi
- Possibili discrepanze temporanee tra breakdown vecchi e nuovi (fino a rigenerazione cache o re-run pipeline).
- Performance: la normalizzazione su grandi volumi di file può richiedere ottimizzazione (batch/stream).
- Logging: aumentare la verbosità per tracciare anomalie e edge case durante la transizione.

### Riuso e estendibilità
- La funzione di normalizzazione potrà essere riutilizzata per altri breakdown o pipeline future (es. mining, marketplace, ecc.).

---

