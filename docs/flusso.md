## PROGRAMMA PER ANALIZZARE OPS SAGE DELLE ULTIME 24H PER UN DETERMINATO PROFILEID

# FLUSSO
- Nel frontend l'utente inserisce il profileid ed avvia la ricerca (click del pulsante "analyze)
- Il frontend manda richiesta tramite API al backend per avviare la ricerca (inserisce info: wipeCache=on/off e lats=24) e rimane in attesa.
- Il backend riceve la richiesta ed avvia la ricerca:
    - Dal profileid ricava walletauthority e fee payer. 
    - Scarica tutte le tx delle ultime 24h del walletauthority e fee payer.
    - Tra le tx decodifica tutte le SAGE ops marcando le rimanenti come unknown
    - Ogni SAGE op decodificata viene salvata singolarmente nella cache sotto <profileid>/sage-ops/ usando la signature come nome file JSON
    - Scarica le fleets associate al profileid.
    - Scarica le fleets in rent.
    - Cerca associazioni tra le SAGE ops e fleets accounts (flletid, cargoid, ammoid e fuelid comprese le rented-fleets), se le trova salva in fleet-breakdown, le rimanenti in player-ops.
    - restituisce i risultati al frontend.
- Il frontend riceve i dati e li mostra con grafici, prezzi, dettagli ed aggregazioni.    


# STRUTTURA DELLA CACHE

cache/
├─ <PROFILEID>/
│  ├─ <PROFILEID>.json              # metadati (es. lastFetched, version, source, allowed wallets)
│  ├─ rpc-pool.json                 # pool creata con prune utilizzata da RPC manager per servire conn.
│  ├─ fleet-breakdowns/
│  ├─ fleets/                       # vengono salvati files (<fleetid.json>)
│  ├─ player-ops/     
│  ├─ playload/                   
│  ├─ rented-fleets/
│  ├─ reports/
│  ├─ srsly/
│  ├─ sage-ops/                      # ogni SAGE op decodificata viene salvata come <signature>.json
│  ├─ unknown/
│  └─ wallet-txs/                   # transazioni raw (<hash>.json)
|        ├─ <ALLOWEDWALLTE1>/
|        ├─ <ALLOWEDWALLTE2>/...
        



includi anche gli account fleets nel decoder 
Per includere sempre gli account id (pubkey) nel JSON di output del decoder Rust, devi:

Modificare la serializzazione delle istruzioni nel decoder Rust (carbon_decoder) affinché ogni istruzione includa un campo "accounts" o "accountKeys" con la lista dei pubkey coinvolti.
Assicurarti che la funzione che costruisce il JSON di output per ogni istruzione aggiunga questa informazione, recuperandola da AccountMeta o struttura equivalente.
Esempio di serializzazione Rust:


use serde_json::json;// ...dopo aver decodificato l'istruzione e ottenuto accounts...let output = json!({    "name": instruction_name,    "data": decoded_data,    "accounts": accounts.iter().map(|acc| acc.pubkey.to_string()).collect::<Vec<_>>(),    // ...altri campi...});println!("{}", output);
Cosa fare:

Individua nel decoder Rust il punto in cui viene prodotto il JSON per ogni istruzione.
Aggiungi la serializzazione degli account come sopra.
Ricompila il binario e verifica che il JSON di output includa sempre "accounts": [...]. 
