# Documentazione: Condivisione delle Dipendenze

## Introduzione
La condivisione delle dipendenze è una pratica fondamentale nei progetti Rust multi-crate, come quelli organizzati in un workspace. Permette di evitare duplicazioni, garantire coerenza tra le versioni delle librerie utilizzate e semplificare la manutenzione del codice.

## Struttura del Workspace
Nel progetto corrente, la struttura è la seguente:

- `Cargo.toml` (root): definisce il workspace e le dipendenze condivise
- `player-profile-decoder/`, `rental-decoder/`, `shared/`: crate membri del workspace

## Gestione delle Dipendenze

### 1. Definizione delle Dipendenze Condivise
Le dipendenze che devono essere utilizzate da più crate vengono dichiarate nella sezione `[workspace.dependencies]` del `Cargo.toml` principale (root). Esempio:

```toml
[workspace]
members = [
    "player-profile-decoder",
    "rental-decoder",
    "shared"
]

[workspace.dependencies]
serde = "1.0"
anyhow = "1.0"
```

### 2. Utilizzo delle Dipendenze nei Crate Membri
Nei `Cargo.toml` dei singoli crate, NON è necessario specificare la versione delle dipendenze già dichiarate in `[workspace.dependencies]`. Basta indicare il nome della dipendenza:

```toml
[dependencies]
serde = {}
anyhow = {}
```

Questo garantisce che tutti i crate usino la stessa versione delle librerie.

### 3. Dipendenze Esclusive
Se un crate necessita di una dipendenza non condivisa, può dichiararla normalmente nel proprio `Cargo.toml` con la versione desiderata.

### 4. Dipendenze Locali
Per condividere codice tra i crate, si possono usare path locali:

```toml
[dependencies]
shared = { path = "../shared" }
```

## Vantaggi della Condivisione
- **Coerenza**: Tutti i crate usano le stesse versioni delle librerie.
- **Semplificazione**: Aggiornare una dipendenza in un solo punto.
- **Riduzione dei conflitti**: Meno problemi di versioni multiple in fase di build.

## Best Practice
- Aggiornare le dipendenze condivise solo dal `Cargo.toml` root.
- Usare `[workspace.dependencies]` per tutte le librerie comuni.
- Eseguire `cargo update` dal root per propagare gli aggiornamenti.
- Documentare eventuali eccezioni o dipendenze specifiche nei singoli crate.

## Comandi Utili
- Aggiungere una dipendenza condivisa:
  ```sh
  cargo add nome_pacchetto --workspace
  ```
- Aggiornare tutte le dipendenze:
  ```sh
  cargo update
  ```
- Build di tutto il workspace:
  ```sh
  cargo build --workspace
  ```

## Riferimenti
- [Rust Book: Cargo Workspaces](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html)
- [Cargo Reference: workspace.dependencies](https://doc.rust-lang.org/nightly/cargo/reference/workspaces.html#the-workspacedependencies-table)

---
Ultimo aggiornamento: 20 marzo 2026
