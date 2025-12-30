# API List - Star Atlas Explorer Backend

Questo documento elenca tutte le API disponibili nel backend di Star Atlas Explorer (SAE), basato su Express.js e TypeScript.

## Panoramica
Il server gira su `http://localhost:3000` e fornisce API per interagire con il gioco Star Atlas, inclusi profili, flotte, transazioni, fees SAGE, e altro.

## API Disponibili

### 1. Homepage
- **Metodo**: GET
- **Endpoint**: `/`
- **Descrizione**: Serve la pagina principale dell'applicazione (index.html).
- **Parametri**: Nessuno
- **Risposta**: File HTML statico

### 2. Health Check
- **Metodo**: GET
- **Endpoint**: `/health`
- **Descrizione**: Verifica lo stato del server.
- **Parametri**: Nessuno
- **Risposta**: JSON con status "ok" e timestamp
- **Esempio**: `GET /health` → `{"status": "ok", "timestamp": 1234567890}`

### 3. Game Info
- **Metodo**: GET
- **Endpoint**: `/api/game`
- **Descrizione**: Recupera informazioni generali sul gioco Star Atlas.
- **Parametri**: Nessuno
- **Risposta**: JSON con dati del gioco
- **Cache**: Non applicabile
- **Note**: Utilizza RPC per ottenere dati in tempo reale

### 4. Player Profile
- **Metodo**: POST
- **Endpoint**: `/api/profile`
- **Descrizione**: Ottiene il profilo di un giocatore specifico.
- **Parametri Body**:
  - `profileId` (string, required): ID del profilo
  - `refresh` (boolean, optional): Forza refresh ignorando cache
- **Risposta**: JSON con dati del profilo
- **Cache**: Sì, su disco per `profile/{profileId}`
- **Esempio**: `POST /api/profile` con body `{"profileId": "abc123"}`

### 5. Fleets
- **Metodo**: POST
- **Endpoint**: `/api/fleets`
- **Descrizione**: Recupera le flotte associate a un profilo giocatore.
- **Parametri Body**:
  - `profileId` (string, required): ID del profilo
  - `refresh` (boolean, optional): Forza refresh
- **Risposta**: JSON con lista flotte
- **Cache**: Sì, su disco per `fleets/{profileId}`
- **Note**: Include scansione per flotte noleggiate

### 6. Planets
- **Metodo**: POST
- **Endpoint**: `/api/planets`
- **Descrizione**: Ottiene informazioni sui pianeti.
- **Parametri Body**: Dipende dall'implementazione (da verificare)
- **Risposta**: JSON con dati pianeti

### 7. Compose Fleet
- **Metodo**: POST
- **Endpoint**: `/api/compose-fleet`
- **Descrizione**: Compone una flotta con navi specifiche.
- **Parametri Body**: Probabilmente ID flotta e navi
- **Risposta**: JSON con composizione flotta

### 8. Transactions
- **Metodo**: POST
- **Endpoint**: `/api/transactions`
- **Descrizione**: Recupera transazioni per una flotta.
- **Parametri Body**: ID flotta, ecc.
- **Risposta**: JSON con lista transazioni

### 9. Wallet SAGE Fees
- **Metodo**: POST
- **Endpoint**: `/api/wallet-sage-fees`
- **Descrizione**: Ottiene fees SAGE per un wallet.
- **Parametri Body**:
  - `walletPubkey` (string, required): Chiave pubblica wallet
  - `refresh` (boolean, optional)
- **Risposta**: JSON con fees

### 10. Wallet SAGE Fees Stream
- **Metodo**: POST
- **Endpoint**: `/api/wallet-sage-fees-stream`
- **Descrizione**: Streaming di fees SAGE per wallet.
- **Parametri Body**: Simile a sopra, probabilmente per dati in tempo reale
- **Risposta**: JSON con dati streaming

### 11. Wallet SAGE Fees Detailed
- **Metodo**: POST
- **Endpoint**: `/api/wallet-sage-fees-detailed`
- **Descrizione**: Fees SAGE dettagliate 24h con breakdown per flotta (legacy non-streaming).
- **Parametri Body**:
  - `walletPubkey` (string, required)
  - `fleetAccounts` (array, optional)
  - `fleetNames` (object, optional)
  - `fleetRentalStatus` (object, optional)
  - `hours` (number, optional, default 24)
  - `refresh` (boolean, optional)
- **Risposta**: JSON con fees dettagliate
- **Cache**: Sì, con chiave hash basata sui parametri
- **Esempio**: Come visto nel terminale: `POST /api/wallet-sage-fees-detailed` con `{"walletPubkey": "...", "refresh": true}`

### 12. Cache Wipe
- **Metodo**: POST
- **Endpoint**: `/api/cache/wipe`
- **Descrizione**: Pulisce la cache.
- **Parametri Body**: Probabilmente tipo di cache da pulire
- **Risposta**: Conferma pulizia

### 13. Diagnostics Fleet Map
- **Metodo**: POST
- **Endpoint**: `/api/diagnostics/fleet-map`
- **Descrizione**: Diagnostica per mappa flotte.
- **Parametri Body**: Dipende
- **Risposta**: JSON diagnostico

### 14. Prices
- **Metodo**: GET
- **Endpoint**: `/api/prices`
- **Descrizione**: Proxy per prezzi da CoinGecko (Bitcoin, Solana, Star Atlas, Star Atlas DAO in USD).
- **Parametri**: Nessuno
- **Risposta**: JSON con prezzi
- **Esempio**: `{"bitcoin": {"usd": 50000}, "solana": {"usd": 100}, ...}`

### 15. WPAC
- **Metodo**: GET
- **Endpoint**: `/api/wpac`
- **Descrizione**: Informazioni su WPAC (da verificare, forse White Paper o qualcosa di specifico).
- **Parametri**: Nessuno
- **Risposta**: JSON

### 16. Transaction Details
- **Metodo**: GET
- **Endpoint**: `/api/tx-details/:txid`
- **Descrizione**: Dettagli di una transazione specifica.
- **Parametri URL**:
  - `txid` (string): ID transazione
- **Risposta**: JSON con dettagli transazione parsata
- **Note**: Utilizza pool RPC con retry

### 17. Decode Instruction
- **Metodo**: GET
- **Endpoint**: `/api/decode-instruction/:instruction`
- **Descrizione**: Decodifica un'istruzione SAGE/Crafting usando decoder ufficiali.
- **Parametri URL**:
  - `instruction` (string): Nome istruzione
- **Risposta**: JSON con decodifica o errore se sconosciuta
- **Note**: Lista categorie disponibili se errore

### 18. Decoders Info
- **Metodo**: GET
- **Endpoint**: `/api/decoders/info`
- **Descrizione**: Lista tutte le istruzioni supportate e categorie.
- **Parametri**: Nessuno
- **Risposta**: JSON con categorie e istruzioni
- **Esempio**: `{"total_instructions": 123, "categories": {...}, "source": "Official Star Atlas Carbon Decoders"}`

### 19. RPC Metrics
- **Metodo**: GET
- **Endpoint**: `/api/rpc-metrics`
- **Descrizione**: Metriche di debug per il pool RPC.
- **Parametri**: Nessuno
- **Risposta**: JSON con metriche RPC

### 20. Extract Material Actions
- **Metodo**: POST
- **Endpoint**: `/api/extract-material-actions`
- **Descrizione**: Estrae azioni materiali/token da una lista di firme transazione.
- **Parametri Body**:
  - `signatures` (array, required): Lista di firme transazione
- **Risposta**: JSON con azioni estratte

### 21. Debug Test Result
- **Metodo**: GET
- **Endpoint**: `/api/debug/test-result`
- **Descrizione**: Restituisce test_result.json locale per forzare rendering UI.
- **Parametri**: Nessuno
- **Risposta**: JSON di test

### 22. Debug Fleet Association Check
- **Metodo**: POST
- **Endpoint**: `/api/debug/fleet-association-check`
- **Descrizione**: Verifica associazione account-flotte e validazione mapping.
- **Parametri Body**:
  - `profileId` (string, required): ID del profilo
  - `fleetAccounts` (array, required): Lista account flotta passati
  - `fleetNames` (object, optional): Nomi flotta passati
- **Risposta**: JSON con validazione account, account orfani/mancanti
- **Cache**: No
- **Note**: Confronta account passati con quelli derivati da getFleets

### 23. Debug Transaction Fleet Mapping
- **Metodo**: POST
- **Endpoint**: `/api/debug/transaction-fleet-mapping`
- **Descrizione**: Analizza associazione per singola transazione.
- **Parametri Body**:
  - `signature` (string, required): Firma transazione
  - `fleetAccounts` (array, required): Lista account flotta per confronto
- **Risposta**: JSON con flotta associata, ragione associazione, dettagli transazione
- **Cache**: No
- **Note**: Utile per debug perché una transazione è associata a una flotta

## Note Generali
- **Autenticazione**: Nessuna richiesta specifica menzionata.
- **Errori**: Le API restituiscono errori 400 per parametri mancanti, 500 per errori server.
- **Cache**: Molte API usano cache su disco per migliorare performance; usa `refresh=true` per forzare.
- **RPC Pool**: Il backend usa un pool di connessioni RPC per gestire richieste Solana.
- **WebSocket**: Alcune API potrebbero usare WS per dati real-time.

## Come Usare
Avvia il server con `npm start` o `tsx src/index.ts`, poi fai richieste HTTP agli endpoint sopra.</content>
<parameter name="filePath">/home/luca/Scaricati/sae-main/api-list.md