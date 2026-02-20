# Flussi Tecnici e Sequenze SAE

Questo documento descrive i principali flussi applicativi e le sequenze tecniche del progetto SAE, utili per sviluppo e debugging.

---

## 1. Flusso di Analisi Profilo

1. **Utente** apre la webapp e collega il wallet Solana oppure inserisce manualmente un Profile ID.
2. **Frontend**:
   - Se wallet collegato: richiede firma di una challenge per autenticazione.
   - Se Profile ID manuale: salta autenticazione, solo analisi pubblica.
3. **Invio richiesta**:
   - POST `/api/analyze-profile` con Profile ID (e JWT se autenticato)
4. **Backend**:
   - Verifica JWT (se presente) tramite `authenticateToken`
   - Recupera dati on-chain tramite decoder Rust
   - Aggiorna/legge cache prezzi ticker
   - Restituisce analisi dettagliata
5. **Frontend**:
   - Visualizza risultati in tempo reale (charts, tabelle, breakdown fleet)

---

## 2. Flusso di Autenticazione (JWT)

1. **Frontend** richiede challenge al backend
2. **Wallet** firma la challenge
3. **Frontend** invia firma a `/auth/login`
4. **Backend**:
   - Verifica firma (`verifySignature`)
   - Genera JWT (`jwtHandler`)
   - Restituisce JWT al frontend
5. **Frontend** usa JWT per chiamate protette

---

## 3. Flusso Caching Prezzi Ticker

- **Scrittura**: Un solo processo PM2 aggiorna `/interna_cache/tickers-prices.json` ogni 30 minuti
- **Lettura**: Tutti i processi backend leggono la cache on-demand prima di rispondere a `/api/prices`
- **Fallback**: Se dati non disponibili, errore 503

---

## 4. Sequenza Frontend (GUI)

1. **Schermata iniziale**: bottoni Connect Wallet / Enter No Wallet
2. **Dopo login**: mostra walletpubkey, lista profileid (se disponibile), textbox per inserimento manuale
3. **Analisi**: invio richiesta, visualizzazione loader, aggiornamento risultati
4. **Sidebar**: mostra dati wallet/profile, aggiorna su selezione

---

## 5. Protezione Rotte

- Tutte le rotte `/api/protected/*` e `/api/user-profile` richiedono JWT valido
- Middleware `authenticateToken` verifica e popola `req.user`

---

## Riferimenti file chiave
- `frontend/flusso gui.md` — Dettaglio flusso GUI
- `ANALISI_AUTH_APPROFONDITA.md` — Flusso autenticazione
- `PROTECT_ROUTES.md` — Protezione API
- `tickers_price_cache_managment.md` — Gestione cache prezzi
- `src/backend/routes/`, `src/backend/middleware/`, `src/utils/auth/` — Implementazione
