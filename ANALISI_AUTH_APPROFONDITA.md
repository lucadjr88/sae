# Analisi Approfondita: Connessione Wallet, Firma e Autenticazione in SAE

## 1. Panoramica Generale
Il progetto SAE (Star Atlas Explorer) integra la connessione a wallet Solana, la firma di messaggi e la gestione dell'autenticazione per analizzare e visualizzare le attività di gioco su blockchain. L'architettura prevede una netta separazione tra frontend (UI e interazione wallet), backend (API, verifica firme, orchestrazione) e decoder Rust (parsing dati on-chain).

---

## 2. Connessione al Wallet

### 2.1 Frontend
- **Tecnologia**: Vanilla JS, con probabile uso di librerie Solana standard (es. `@solana/wallet-adapter`).
- **Componenti Coinvolti**:
  - File: `frontend wallet adapter.md`, `frontend/src/app/`, `frontend/src/services/`
  - Gestione connessione/disconnessione wallet, selezione provider (Phantom, Solflare, ecc.), e stato utente.
- **Flusso Tipico**:
  1. L’utente seleziona e connette il wallet tramite UI.
  2. Il frontend mantiene lo stato del wallet connesso (pubkey, provider).
  3. Le operazioni che richiedono autenticazione (analisi profilo, export, ecc.) partono solo se il wallet è connesso.

### 2.2 Backend
- **Ruolo**: Non gestisce direttamente la connessione, ma riceve richieste contenenti identificativi wallet e, se necessario, firme di autenticazione.
- **Endpoint Rilevanti**:
  - `/api/analyze-profile` (POST): Richiede `profileId` (associato a wallet).
  - `/debug/player-profile-id?wallet=...`: Ricerca profilo associato a wallet.
  - `/debug/get-wallet-authority?profileId=...`: Estrae allowed wallets.

---

## 3. Firma e Verifica

### 3.1 Firma lato Frontend
- **Meccanismo**: Il frontend può richiedere al wallet di firmare messaggi (es. challenge, payload di autenticazione) tramite le API del provider Solana.
- **Componenti Coinvolti**:
  - Moduli JS che interagiscono con l’oggetto wallet (es. `window.solana.signMessage`).
  - Possibile presenza di helper per la generazione e gestione delle challenge.

### 3.2 Verifica lato Backend
- **Meccanismo**: Il backend riceve la firma e la verifica usando la chiave pubblica del wallet.
- **Endpoint Coinvolti**:
  - Non sono esplicitati endpoint di login/signature verification, ma la presenza di test (`test_auth_flow.ts`, `test_auth_with_keypair.ts`) suggerisce che la logica sia in sviluppo o test.
- **Allowed Wallets**: Il backend verifica che la chiave pubblica sia tra quelle autorizzate nel profilo (allowed wallets), garantendo che solo wallet abilitati possano eseguire operazioni sensibili.

---

## 4. Token di Autenticazione

- **Assenza di JWT**: Non risultano implementati JWT o sessioni classiche. L’autenticazione si basa su challenge firmate e verifica della proprietà del wallet.
- **Flusso previsto**:
  1. Il backend genera una challenge (nonce, timestamp, ecc.).
  2. Il frontend la firma col wallet.
  3. Il backend verifica la firma e, se valida, consente l’operazione richiesta.
- **Persistenza**: L’autenticazione è stateless; ogni richiesta sensibile richiede una nuova firma o la verifica della proprietà del wallet.

---

## 5. Sicurezza

- **Verifica allowed wallets**: Tutte le operazioni critiche verificano che il wallet sia tra quelli autorizzati nel profilo.
- **Challenge univoche**: Per evitare replay attack, le challenge devono essere uniche e a scadenza breve.
- **Nessuna gestione password**: L’identità è garantita esclusivamente dalla chiave privata del wallet.
- **Protezione endpoint**: Gli endpoint di analisi e modifica dati richiedono autenticazione tramite firma.

---

## 6. Flusso Tipico di Autenticazione

1. **Connessione**: L’utente connette il wallet tramite frontend.
2. **Richiesta challenge**: Il frontend richiede una challenge al backend (opzionale, se implementato).
3. **Firma**: L’utente firma la challenge col wallet.
4. **Verifica**: Il backend verifica la firma e la presenza tra gli allowed wallets.
5. **Accesso**: Se la verifica ha successo, l’operazione richiesta viene eseguita.

---

## 7. Componenti e File Coinvolti

- **Frontend**:
  - `frontend wallet adapter.md`: Specifica/implementazione connessione wallet.
  - `frontend/src/app/`, `frontend/src/services/`: Logica di connessione, firma, stato utente.
- **Backend**:
  - `src/test_auth_flow.ts`, `src/test_auth_with_keypair.ts`: Test autenticazione/firma.
  - `src/backend/routes/`: Endpoint API.
  - `src/utils/deriveWalletAuthority.ts`, `src/utils/getWalletAuthority.ts`: Utility per gestione allowed wallets.
- **Documentazione**:
  - `IMPLEMENTAZIONE_AUTH.md`: Dettagli implementativi autenticazione.

---

## 8. Criticità e Best Practice

- **Gestione challenge**: Assicurarsi che le challenge siano randomiche e a scadenza.
- **Verifica firma**: Usare librerie affidabili per la verifica delle firme Solana.
- **Gestione errori**: Fornire feedback chiaro in caso di wallet non autorizzato o firma non valida.
- **Protezione dati**: Non esporre dati sensibili senza verifica della proprietà del wallet.
- **Audit**: Loggare tentativi di accesso e operazioni critiche per audit e debug.

---

## 9. Suggerimenti per Evoluzione

- **Implementare endpoint dedicati per challenge/signature verification** se non già presenti.
- **Considerare l’introduzione di JWT** per sessioni temporanee, se necessario per UX o scalabilità.
- **Espandere i test di autenticazione** per coprire edge case e attacchi comuni.
- **Documentare i flussi di autenticazione** in modo chiaro per sviluppatori e utenti.

---

## 10. Conclusione

Il sistema SAE adotta un modello di autenticazione moderno, basato su wallet Solana e verifica di firma, senza gestione di password o sessioni classiche. La sicurezza si fonda sulla robustezza della crittografia Solana e sulla corretta gestione delle allowed wallets. L’implementazione è in linea con le best practice Web3, ma si consiglia di rafforzare la documentazione e i test per garantire affidabilità e sicurezza.
