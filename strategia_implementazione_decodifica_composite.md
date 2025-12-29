# Strategia di Implementazione per Decodifica Transazioni Composite in SAE

## Data: 29 dicembre 2025

## Obiettivo
Implementare la decodifica delle transazioni composite (beta) in SLY Assistant, che raggruppano più operazioni SAGE in un singolo `VersionedTransaction`. Il progetto SAE già decodifica correttamente le transazioni normali (singola istruzione) utilizzando il decoder ufficiale `star-atlas-decoders-main`. Questa strategia mira a estendere la funzionalità mantenendo la modularità del progetto.

## Contesto del Problema
- **Transazioni Normali**: Una singola istruzione SAGE (es. `idleToLoadingBay`, `withdrawCargoFromFleet`). Decodificate correttamente dal decoder ufficiale.
- **Transazioni Composite**: Più istruzioni raggruppate in un TX per ottimizzare costi (usando beta settings come `transportLoadUnloadSingleTx`). Questi TX falliscono la decodifica perché il decoder ufficiale gestisce solo istruzioni singole.
- **Impatto**: Gli utenti non possono analizzare TX composite, limitando l'efficacia degli script di automazione fleet.

## Analisi dell'Architettura Corrente
Il progetto SAE è modulare con:
- **Decoder Ufficiale**: `star-atlas-decoders-main` (Rust/Carbon) per decodifica istruzioni SAGE.
- **Gestione TX**: Parsing JSON di TX da cache (`cache/wallet-txs/`).
- **Moduli Esistenti**: Probabilmente `src/` con funzioni per parsing e decoding.
- **Dipendenze**: Node.js, Solana Web3.js, Anchor.

La decodifica attuale assume 1 istruzione per TX.

## Requisiti per l'Implementazione
- **Compatibilità**: Mantenere decodifica normale invariata.
- **Estensibilità**: Supportare TX con N istruzioni.
- **Modularità**: Aggiungere nuovi moduli senza rompere esistenti.
- **Performance**: Evitare overhead per TX normali.
- **Error Handling**: Gestire TX composite malformate o istruzioni non decodificabili.
- **Test**: Validare con TX composite reali (es. da cache).

## Architettura Proposta
Aggiungere un modulo `composite-decoder.js` che:
- Rileva se una TX è composite (più istruzioni).
- Estrae e decodifica ogni istruzione singolarmente.
- Aggrega risultati in un oggetto strutturato.

Struttura moduli aggiornata:
```
src/
├── decoder.js (esistente: per TX normali)
├── composite-decoder.js (nuovo: per TX composite)
├── transaction-parser.js (aggiornato: rileva tipo TX)
└── ...
```

## Passi di Implementazione
### 1. Analisi e Preparazione (1-2 giorni)
- Esaminare `star-atlas-decoders-main` per confermare supporto solo istruzioni singole.
- Identificare TX composite in cache (es. quelle con `message.instructions.length > 1`).
- Creare test case con TX normali e composite.

### 2. Creazione Modulo Composite Decoder (2-3 giorni)
- **File**: `src/composite-decoder.js`
- **Funzionalità**:
  - Importare `VersionedTransaction` da `@solana/web3.js`.
  - Importare decoder ufficiale.
  - Funzione `decodeComposite(txJson)`:
    - Deserializza TX.
    - Loop su `tx.message.instructions`.
    - Per ogni istruzione: decodifica con decoder ufficiale.
    - Raccogli risultati in array `{ index, decoded, error }`.
- **Esempio Codice**:
  ```javascript
  const { VersionedTransaction } = require('@solana/web3.js');
  const { SageDecoder } = require('star-atlas-decoders');

  function decodeComposite(txData) {
    const tx = VersionedTransaction.deserialize(Buffer.from(txData.transaction, 'base64'));
    const results = [];
    for (let i = 0; i < tx.message.instructions.length; i++) {
      try {
        const decoded = SageDecoder.decodeInstruction(tx.message.instructions[i]);
        results.push({ index: i, decoded, error: null });
      } catch (err) {
        results.push({ index: i, decoded: null, error: err.message });
      }
    }
    return results;
  }

  module.exports = { decodeComposite };
  ```

### 3. Aggiornamento Transaction Parser (1 giorno)
- **File**: `src/transaction-parser.js`
- **Modifiche**:
  - Aggiungere rilevamento tipo TX: `isComposite(txJson) => txJson.transaction.message.instructions.length > 1`
  - Routing: Se normale, usa `decoder.js`; se composite, usa `composite-decoder.js`.
  - Restituire oggetto unificato: `{ type: 'normal|composite', data: decoded }`

### 4. Integrazione con Frontend/Cache (1-2 giorni)
- Aggiornare endpoint API o funzioni che leggono `cache/wallet-txs/` per usare il nuovo parser.
- Aggiungere logging per TX composite (es. numero istruzioni).
- UI: Mostrare risultati aggregati per composite (es. lista di operazioni).

### 5. Test e Validazione (2-3 giorni)
- **Unit Test**: Testare `composite-decoder.js` con mock TX.
- **Integration Test**: Usare TX reali da cache.
- **Regression Test**: Assicurare TX normali funzionino ancora.
- **Edge Cases**: TX vuote, istruzioni non SAGE, errori decoding.
- **Benchmark**: Confrontare performance con TX normali.

### 6. Documentazione e Deployment (1 giorno)
- Aggiornare README con supporto composite.
- Aggiungere commenti nel codice.
- Deploy e monitoraggio errori.

## Rischi e Mitigazioni
- **Rischio**: Decoder ufficiale potrebbe cambiare API.
  - **Mitigazione**: Usare versioni pinned in `package.json`.
- **Rischio**: Overhead performance per TX normali.
  - **Mitigazione**: Rilevamento precoce senza deserializzazione completa.
- **Rischio**: Istruzioni non decodificabili.
  - **Mitigazione**: Error handling robusto, log errori senza crash.

## Metriche di Successo
- 100% TX normali decodificate correttamente.
- TX composite decodificate con dettaglio per istruzione.
- Nessun regression in performance.
- Copertura test >90%.

## Timeline Stimata
- Totale: 7-12 giorni (dipende da complessità).
- Priorità: Alta, per abilitare beta features in SLY.

Questa strategia mantiene la modularità e estende il progetto senza breaking changes.</content>
<parameter name="filePath">/home/luca/Scaricati/sae-main/strategia_implementazione_decodifica_composite.md