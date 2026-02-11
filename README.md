## Avvio server con logging affidabile

Per ottenere un unico file di log con tutti i messaggi (stdout/stderr, log API, errori), avvia il backend direttamente con tsx (senza npm run dev) e redirigi l'output:

```sh
pkill -9 node
cd <project_root>
rm -rf log dist
sleep 1
npm run build
mkdir -p log
npx tsx src/app.ts > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &
```

**Note:**
- Usare `npx tsx src/app.ts` direttamente garantisce che stdout/stderr del backend vadano nel file di log.
- Evita di usare `nohup npm run dev` per il logging, perché npm/npx possono gestire i flussi in modo diverso e non sempre propagano il redirect.
- Tutti i log delle API e gli errori saranno visibili nel file di log generato.
# Test Esecuzione moduli TypeScript/ESM

Per eseguire test manuali TypeScript/ESM:

```
npm run test
```

oppure direttamente:

```
npx tsx src/utils/rpc/test-rpc-pool-manager.ts
```

Assicurarsi che la directory `utility/rpc-pool-complete.json` sia presente e che i moduli siano installati.
# SAE Refactored - README

Progetto in refactoring. Vedi implementation_plan_for_simplification.md per dettagli.
