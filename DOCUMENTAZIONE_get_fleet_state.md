# Documentazione script get_fleet_state

## Scopo

Lo script `get_fleet_state` permette di recuperare e decodificare lo stato di una fleet di Star Atlas, dato un fleet id (può essere un account SAGE o SRSLY), e di stampare a video (e opzionalmente salvare) i dati di posizione e stato della fleet secondo la struttura ufficiale dei decoder.

## Funzionamento generale

1. **Input**: accetta due argomenti da riga di comando:
   - URL RPC Solana (es: `https://api.mainnet-beta.solana.com`)
   - Fleet ID (pubkey base58)
2. **Recupero account**: scarica l'account associato al Fleet ID.
3. **Identificazione programma**: stampa il Program ID (owner) dell'account.
4. **Decodifica**:
   - Se l'account è un `ContractState` SRSLY, estrae la pubkey della fleet SAGE e scarica/decodifica quella.
   - Se l'account è una fleet SAGE, decodifica direttamente.
   - Se l'account è una fleet SRSLY, decodifica direttamente.
   - Se nessun decoder funziona, salva i dati raw.
5. **Estrazione posizione**: per fleet SAGE, stampa sempre tutti i campi settore (sector, from_sector, to_sector, current_sector) per ogni variante di stato.

## Dipendenze principali

- `solana-client`, `solana-sdk`: per interagire con la blockchain Solana
- `carbon-sage-starbased-decoder`, `carbon-srsly-decoder`: per la decodifica degli account SAGE e SRSLY
- `serde_json`, `base64`, `anyhow`: serializzazione, utilità, gestione errori

## Struttura file e funzioni principali

- **File principale**: [`scripts/src/main.rs`](scripts/src/main.rs)
- **Funzione main**: gestisce parsing argomenti, logica di decodifica, stampa e salvataggio
- **Righe chiave**:
  - Parsing argomenti: 13-20
  - Download account: 23-25
  - Decodifica ContractState: 28-54
  - Decodifica SAGE/SRSLY fleet: 81-120
  - Fallback raw: 137-164
- **Gestione varianti FleetState**: stampa sempre tutti i campi settore, anche se non valorizzati, per chiarezza e uniformità.

## Esempio di utilizzo

```sh
cargo run --manifest-path scripts/Cargo.toml --release -- https://api.mainnet-beta.solana.com <FLEET_ID>
```

## Output

- Stampa a video lo stato della fleet e i campi di posizione (sector, from_sector, to_sector, current_sector)
- Salva opzionalmente i dati decodificati in `fleet_state.json` o i dati raw in `fleet_state_raw.json`

## Note aggiuntive

- Lo script segue la logica e le strutture ufficiali del repo STAR-ATLAS-DECODERS-MAIN.
- I decoder sono aggiornati tramite dipendenze locali (path) per garantire compatibilità con le ultime versioni.
- I campi di posizione sono sempre stampati, anche se nulli, per facilitare parsing e automazione.
