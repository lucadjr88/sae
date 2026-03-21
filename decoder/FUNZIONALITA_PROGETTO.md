# Documentazione: Funzionalità del Progetto

## Introduzione
Questo repository contiene un workspace Rust strutturato per la decodifica e la gestione di profili giocatore e contratti di noleggio, con una chiara separazione tra logica condivisa e specifica dei diversi domini applicativi.

## Struttura del Progetto
- **player-profile-decoder/**: Crate dedicato alla decodifica e gestione dei profili giocatore, ruoli e permessi.
- **rental-decoder/**: Crate focalizzato sulla decodifica e gestione dei contratti di noleggio e delle relative operazioni.
- **shared/**: Crate di utilità che contiene tipi, funzioni e strutture condivise tra gli altri due crate.

## Funzionalità Principali

### 1. player-profile-decoder
- Decodifica dati relativi ai profili dei giocatori.
- Gestione di ruoli, permessi e inviti all'interno di un profilo.
- Operazioni su membri, chiavi di profilo e autorizzazioni.
- Implementazione di istruzioni per la modifica e la gestione dei profili (es. creazione, invito, accettazione ruoli, aggiunta/rimozione membri, ecc.).

### 2. rental-decoder
- Decodifica e gestione di contratti di noleggio.
- Gestione dello stato dei contratti, fleet e thread associati.
- Implementazione di istruzioni per la gestione del ciclo di vita di un contratto di noleggio (creazione, pagamento, accettazione, cancellazione, chiusura, reset, ecc.).
- Supporto per la gestione di pagamenti ricorrenti e trigger di eventi.

### 3. shared
- Definizione di tipi comuni (es. clock_data, member_status, profile_key, profile_permissions).
- Funzioni di utilità e serializzazione/deserializzazione condivise.
- Riduzione della duplicazione di codice tra i due decoder.

## Flusso Operativo
1. **Input**: I decoder ricevono dati binari (ad esempio, istruzioni o account serializzati) da decodificare.
2. **Decodifica**: Utilizzano le strutture e le funzioni definite nei rispettivi crate e in `shared` per interpretare i dati.
3. **Output**: Producono strutture Rust leggibili e facilmente manipolabili, pronte per essere utilizzate da altre componenti dell'applicazione o per debugging/analisi.

## Esempi d'Uso
- Decodifica di un fleet di noleggio:
  - Esegui il binario `srsly-decoder` in `rental-decoder/bin` passando i dati da decodificare.
- Decodifica di un profilo giocatore:
  - Esegui il binario `decode_fleets` in `player-profile-decoder/bin` con i dati di input.

## Vantaggi della Struttura
- **Modularità**: Separazione chiara tra domini applicativi e codice condiviso.
- **Riutilizzo**: Tipi e funzioni comuni centralizzati in `shared`.
- **Manutenibilità**: Ogni crate ha responsabilità ben definite e può essere testato/esteso indipendentemente.

## Come Estendere il Progetto
- Aggiungere nuove istruzioni o tipi nei rispettivi moduli.
- Estendere `shared` per nuove funzionalità comuni.
- Aggiornare la documentazione per riflettere le modifiche.

## Riferimenti
- [Rust Book: Organizing Large Projects](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html)

---
Ultimo aggiornamento: 20 marzo 2026
