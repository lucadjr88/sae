# Analisi GUI Connessione Wallet: Android vs Frontend Web SAE

## 1. Stato Attuale: Android App

### Schermate e UX
- **StartScreen.kt**: Schermata di avvio con due pulsanti principali:
  - **CONNECT WALLET**: Avvia la procedura di connessione e autorizzazione wallet (con feedback di stato e disabilitazione durante la connessione).
  - **ENTER NO WALLET**: Permette l’accesso in modalità guest.
- **Design**: UI moderna, sfondo illustrato, header, badge versione, bottoni con icona seedvault2, feedback visivo su stato wallet.
- **MainScreen.kt**: Dopo la connessione, mostra dashboard analisi, input profilo, risultati, ticker prezzi, sidebar con info wallet e cache, breakdown flotte/operazioni, grafici, ecc.
- **Componenti**: Uso di componenti riutilizzabili (StartButton, Header, ResultsSection, Sidebar, ecc.), feedback stato (loading, error, success), layout responsive.

## 2. Stato Attuale: Frontend Web SAE

### Schermate e UX
- **index.html**: Presente una schermata iniziale con due pulsanti:
  - **CONNECT WALLET** (attualmente disabilitato)
  - **ENTER NO WALLET**
- **Design**: Simile all’app (hero, bottoni con icona seedvault2, badge versione), ma la logica di connessione wallet non è implementata lato JS/TS.
- **Dopo l’accesso**: Mostra la dashboard analisi (input profilo, risultati, breakdown flotte/operazioni, grafici, ticker prezzi, sidebar cache/wallet).
- **Componenti**: Rendering dinamico dei risultati, breakdown, grafici, ticker, ma nessun modulo di connessione wallet attivo.

## 3. Gap e Cosa Manca nel Frontend Web

- **Manca la logica di connessione wallet**:
  - Il pulsante CONNECT WALLET è disabilitato e non ha handler JS.
  - Non esiste un modulo TypeScript che gestisca la selezione provider, la richiesta di firma, la verifica connessione, lo stato utente, ecc.
- **Manca la gestione stato wallet**:
  - Nessun feedback visivo su connessione/disconnessione, errore, wallet connesso, ecc.
  - Nessuna visualizzazione della chiave pubblica o info wallet nella sidebar.
- **Manca la logica di firma/autenticazione**:
  - Nessun flusso di challenge/signature come in mobile.
  - Nessun modulo per inviare la firma al backend e gestire la risposta.
- **Manca la navigazione condizionale**:
  - Non viene gestito il passaggio automatico alla dashboard dopo la connessione wallet.
  - Non c’è separazione tra modalità guest e autenticata.

## 4. Come Implementare le Nuove Pagine GUI nel Frontend Web

### a) Modulo TypeScript per Connessione Wallet
- Integrare una libreria come `@solana/wallet-adapter` (o simili) per browser.
- Creare un modulo `wallet.ts` che gestisca:
  - Selezione provider (Phantom, Solflare, ecc.)
  - Connessione/disconnessione
  - Stato utente (isConnecting, isConnected, publicKey, error)
  - Eventi e callback (onConnect, onDisconnect, onError)

### b) Aggiornare la Start Screen
- Abilitare il pulsante CONNECT WALLET e collegarlo al modulo wallet.
- Mostrare feedback di stato (loading, errore, successo).
- Navigare automaticamente alla dashboard dopo la connessione.
- Permettere l’accesso guest come fallback.

### c) Gestione Stato Wallet e Sidebar
- Aggiornare la sidebar per mostrare info wallet (pubkey, stato, icona provider).
- Aggiungere pulsante di disconnessione.
- Mostrare errori di connessione e feedback visivo.

### d) Flusso di Firma/Autenticazione
- Implementare la richiesta di challenge dal backend e la firma tramite wallet.
- Inviare la firma al backend per la verifica.
- Gestire la risposta e aggiornare lo stato autenticazione.

### e) Integrazione con Moduli TS Esistenti
- Esporre lo stato wallet e le funzioni di firma come API globali (window.wallet, window.signMessage, ecc.).
- Consentire ai moduli di analisi di accedere allo stato wallet e inviare richieste autenticando l’utente.
- Aggiornare la UI dinamicamente in base allo stato wallet.

### f) UX/UI
- Mantenere coerenza visiva con l’app mobile (icone, colori, feedback, layout responsive).
- Riutilizzare le icone seedvault2 e lo stile dei bottoni.
- Fornire feedback chiaro su ogni stato (connesso, errore, in attesa, guest).

## 5. Esempio di Struttura Modulo wallet.ts
```ts
// wallet.ts (esempio semplificato)
import { WalletAdapterNetwork, ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

export class Wallet {
  isConnected = false;
  isConnecting = false;
  publicKey = null;
  error = null;
  // ...
  async connect() { /* ... */ }
  async disconnect() { /* ... */ }
  async signMessage(msg: Uint8Array) { /* ... */ }
}

window.wallet = new Wallet();
```

## 6. Conclusioni
- L’app Android offre una UX wallet-driven moderna e chiara: replicare la stessa esperienza nel frontend web.
- Serve implementare un modulo wallet TS, abilitare la UI, gestire lo stato e la firma, integrare la logica di autenticazione e aggiornare la dashboard/sidebar.
- Mantenere coerenza visiva e di flusso tra mobile e web.
