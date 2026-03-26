# Analisi degli Script Rust nel Progetto

## 1. Suddivisione e Struttura

### a. Decoder Player Profile
- **Percorso:** `decoder/player-profile-decoder/`
- **Tipologia:** Crate Rust (`Cargo.toml` presente)
- **Binari:**  
  - `src/bin/decode_fleets.rs`: Script per decodificare le fleet associate a un profilo Star Atlas.
- **Libreria:**  
  - `src/lib.rs`: Espone il decoder come libreria.
- **Compilazione:**  
  - Standard Rust (`cargo build`), produce una libreria e il binario `decode_fleets`.
- **Utilizzo:**  
  - Usato per estrarre e decodificare fleet da account su Solana, probabilmente richiamato da script di backend o manualmente per analisi.

### b. Decoder SRSLY (Fleet Rentals)
- **Percorso:** `src/backend/rental/decoder/`
- **Tipologia:** Crate Rust (`Cargo.toml` presente)
- **Binari:**  
  - `src/bin/srsly-decoder.rs`: Script per decodificare account relativi a contratti di rental, fleet, rental state, thread.
- **Libreria:**  
  - `src/lib.rs`: Espone il decoder come libreria.
- **Compilazione:**  
  - Script dedicato: `scripts/build-and-copy-srsly-decoder.sh`  
    - Compila con `cargo build --release --features serde`
    - Copia il binario risultante in `dist/backend/rental/srsly-decoder`
- **Utilizzo:**  
  - Usato dal backend per decodificare dati SRSLY, probabilmente invocato da Node.js tramite processi esterni.

### c. Script Standalone
- **Percorso:** `get_fleet_state.rs`
- **Tipologia:** Script Rust singolo, non parte di un crate.
- **Funzione:** Recupera e salva lo stato di una fleet dato un fleet id, usando le stesse dipendenze dei decoder.
- **Compilazione:**  
  - Compilabile direttamente con `rustc get_fleet_state.rs` (se le dipendenze sono disponibili).
- **Utilizzo:**  
  - Per analisi manuali o task di debug/estrazione dati.

## 2. Compilazione

- **Crate principali** (`player-profile-decoder`, `carbon-srsly-decoder`):  
  - Compilati tramite `cargo build` (manuale o via script).
  - Il decoder SRSLY ha uno script di build e copia dedicato.
- **Script singoli**:  
  - Compilabili direttamente se necessario.


## 3. Utilizzo nel Progetto

- **Backend Node.js**:  
  - Invoca i binari Rust (es. `srsly-decoder`) tramite processi esterni per decodificare dati complessi.
- **Analisi manuali**:  
  - Gli script possono essere usati da sviluppatori per debug, estrazione dati o test.
- **Distribuzione**:  
  - I binari vengono copiati in `dist/backend/rental/` per essere accessibili dal backend.

---

## 4. Procedura per Unificazione e Condivisione delle Librerie Rust

### Situazione attuale

- In `decoder/` sono presenti:
  - `player-profile-decoder/` (già funzionante, struttura completa)
  - `rental-decoder/` (ex SRSLY, struttura simile, da integrare)
  - `shared/` (vuota, da popolare con codice comune)

Entrambi i decoder hanno sottocartelle `accounts/`, `instructions/`, `types/`, e un file `lib.rs`.

### Procedura consigliata

#### 1. Spostare codice condiviso in `shared/`
- Analizza i moduli, tipi e funzioni duplicati o condivisibili tra i due decoder (es: strutture dati, utility, macro, costanti).
- Crea i file necessari in `shared/src/` (es: `types.rs`, `utils.rs`, ...).
- Sposta il codice condiviso da `player-profile-decoder/src/` e `rental-decoder/src/` a `shared/src/`.
- Esporta i moduli condivisi in `shared/src/lib.rs`.

#### 2. Aggiornare le dipendenze nei Cargo.toml
- In `player-profile-decoder/Cargo.toml` e `rental-decoder/Cargo.toml`, aggiungi:
  ```toml
  shared = { path = "../shared" }
  ```
- Rimuovi eventuali duplicati di dipendenze ora gestite da `shared`.

#### 3. Aggiornare i path nei sorgenti
- Modifica gli import nei file Rust dei due decoder:
  - Da: `use crate::types::X;`
  - A: `use shared::types::X;`
- Aggiorna tutti i riferimenti a moduli/strutture spostati in `shared`.

#### 4. Creare il workspace Cargo
- Nella cartella `decoder/`, crea (o aggiorna) un file `Cargo.toml` con:
  ```toml
  [workspace]
  members = [
    "player-profile-decoder",
    "rental-decoder",
    "shared"
  ]
  ```

#### 5. Build unificata
- Da `decoder/`, esegui:
  ```sh
  cargo build --release
  ```
- I binari saranno in `decoder/target/release/`.

#### 6. Test e pulizia
- Verifica che entrambi i decoder funzionino e che il codice condiviso sia effettivamente usato.
- Rimuovi eventuali duplicati rimasti e aggiorna la documentazione.

---

**Nota:**
- Se hai script di build/copy personalizzati, aggiorna i path dei binari.
- Se usi moduli/proc-macro condivisi, valuta se inserirli in `shared` o in un crate separato.

---

Questa procedura garantisce una base condivisa, build semplificata e codice più manutenibile.
