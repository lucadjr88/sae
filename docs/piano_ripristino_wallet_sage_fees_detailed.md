# Piano di Ripristino Funzione getWalletSageFeesDetailed

## 1. Analisi e Backup
- **1.1** Esegui backup del file attuale `src/examples/wallet-sage-fees-detailed.ts` (rinomina o copia come `.bak`).
- **1.2** Documenta la motivazione del ripristino (commit message, commento in testa al file).

## 2. Allineamento Codice
- **2.1** Estrai la versione funzionante della funzione da `sae-main_funzionante/sae-main/src/examples/wallet-sage-fees-detailed.ts`.
- **2.2** Sostituisci l’intera funzione in `sae-main/src/examples/wallet-sage-fees-detailed.ts` con la versione funzionante, rimuovendo ogni blocco di commento multilinea che racchiude la logica reale.
- **2.3** Mantieni eventuali miglioramenti diagnostici o di mapping introdotti nella versione attuale, integrandoli solo se non alterano la logica funzionante.

## 3. Validazione e Build
- **3.1** Esegui `npm run build` per validare la compilazione.
- **3.2** Se compila, annota eventuali warning o differenze di output rispetto alla versione funzionante.

## 4. Test API e Output
- **4.1** Esegui test API `/api/wallet-sage-fees-detailed` con parametri reali (walletPubkey, fleetAccounts).
- **4.2** Verifica che il breakdown delle operazioni e l’associazione delle flotte (es. Rainbow Cargo) siano corretti e che non vi siano più risposte vuote.
- **4.3** Confronta l’output con quello della versione funzionante per assicurare la piena equivalenza.

## 5. Documentazione e Commit

---

# Dettagli Tecnici e Confronto Funzione getWalletSageFeesDetailed

## Differenze principali tra versione attuale e funzionante

### 1. Stato attuale (`src/examples/wallet-sage-fees-detailed.ts`)
- **La logica reale della funzione è completamente commentata** (blocco multilinea).
- Il return è un oggetto vuoto con tutti i campi a zero o array vuoti.
- Sono presenti tentativi di estensione diagnostica e mapping (es. mapping esteso sub-account, log diagnostici Rainbow Cargo), ma non sono attivi.

### 2. Versione funzionante (`sae-main_funzionante/sae-main/src/examples/wallet-sage-fees-detailed.ts`)
- **La funzione è attiva e operativa**: esegue fetch, mapping, breakdown e logging reale.
- Logica di mapping e breakdown operazioni attiva, con output reale e breakdown per flotta/operazione.
- Diagnostica e logging abilitati per i primi N tx e per breakdown.
- Associazione flotte e operazioni funzionante (incluso Rainbow Cargo).

## Confronto Strutturale

| Aspetto | Versione Attuale | Versione Funzionante |
|---------|------------------|----------------------|

## 6. Monitoraggio e Refine
- **6.1** Monitora i log e l’output delle API nelle ore successive.
- **6.2** Se emergono differenze o regressioni, confronta i due file e integra solo le migliorie realmente compatibili.

---

## Dettagli tecnici per il ripristino

- **Sostituire l’intera funzione**: Copiare la funzione attiva dalla versione funzionante, rimuovendo il blocco commentato e il return vuoto.
- **Verificare import aggiuntivi**: La versione attuale importa `fs` e `path` per mapping esteso, la funzionante no. Se si vogliono mantenere estensioni diagnostiche, integrarli solo dopo aver validato la build.
- **DiagnosticMode**: La versione attuale prevede flag diagnostici e log estesi. Integrare solo se non impatta la logica funzionante.
- **Testare ogni step**: Dopo la sostituzione, build e test API. Solo dopo validazione, valutare re-inserimento di log diagnostici avanzati.

## Suggerimento operativo

1. **Backup file attuale**
2. **Sostituzione funzione** con quella funzionante
3. **Build e test**
4. **Solo dopo successo**, valutare re-inserimento di log diagnostici avanzati o mapping esteso, testando ogni step

---

*Questo confronto va integrato in fondo al piano di ripristino per facilitare l’esecuzione step by step e minimizzare errori.*
