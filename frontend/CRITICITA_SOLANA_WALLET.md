# Criticità e Best Practice nella Gestione Wallet Solana e Solana Mobile

## 1. Dichiarazione e Gestione di `window.wallet`

### Problema
- Il codice assume che `window.wallet` sia sempre presente e correttamente inizializzato.
- TypeScript segnala errori perché la proprietà non è dichiarata nell’interfaccia globale.

### Pratica Ufficiale
- Le librerie Solana desktop (Phantom, Solflare, Backpack) espongono il wallet tramite oggetti adapter, non direttamente su `window.wallet`.
- Solana Mobile Adapter richiede una logica di inizializzazione specifica, spesso tramite un adapter custom.

### Esempio Corretto
```typescript
declare global {
  interface Window {
    wallet?: any; // Sostituire 'any' con il tipo corretto se noto
  }
}

// Dopo la selezione adapter
window.wallet = selectedAdapter;
```

---

## 2. Accesso e Uso della PublicKey

### Problema
- Il codice assume che `wallet.publicKey` sia sempre disponibile e in formato base58.
- Su Solana Mobile, la publicKey può essere in diversi formati (base58, base64) e va estratta dal risultato di authorize/connect.

### Pratica Ufficiale
- **Desktop:** publicKey è una proprietà persistente dell’adapter.
- **Mobile:** publicKey va estratta dal risultato di autorizzazione e convertita se necessario.

### Esempio Corretto
```typescript
// Desktop
const pubkey = adapter.publicKey?.toBase58();

// Mobile (base64 → base58)
import bs58 from 'bs58';
const base64 = result.accounts[0].address;
const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
const pubkey = bs58.encode(bytes);
```

---

## 3. Modalità Multi-Wallet e Selezione Adapter

### Problema
- Il modulo non gestisce la selezione tra diversi adapter, né la logica di fallback tra desktop e mobile.

### Pratica Ufficiale
- Le librerie Solana Wallet Adapter prevedono una lista di adapter e una selezione/modale per l’utente.

### Esempio Corretto
```typescript
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
const adapters = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
// Mostrare modale custom per la selezione
```

---

## 4. Gestione degli Eventi e Stato

### Problema
- L’evento custom `walletStateChanged` non è standard.
- La UI assume che la connessione sia sempre valida.

### Pratica Ufficiale
- Gli adapter espongono eventi come `connect`, `disconnect`, `accountChanged`.

### Esempio Corretto
```typescript
adapter.on('connect', () => { /* aggiorna UI */ });
adapter.on('disconnect', () => { /* aggiorna UI */ });
adapter.on('accountChanged', () => { /* aggiorna UI */ });
```

---

## 5. Inizializzazione e Compatibilità

### Problema
- Import di adapter React non utilizzati.
- Logica pensata per vanilla JS/TS ma con import React.

### Pratica Ufficiale
- Su React, la gestione wallet avviene tramite provider e hook.
- Su vanilla JS, si usano adapter standalone.

### Esempio Corretto
- **React:** usare `<WalletProvider>` e hook.
- **Vanilla:** istanziare adapter e gestire manualmente.

---

## 6. Sicurezza e Sessione

### Problema
- Non viene gestita la scadenza della sessione mobile, né la necessità di re-authorization.

### Pratica Ufficiale
- Su mobile, la sessione può scadere e va richiesta una nuova autorizzazione.

### Esempio Corretto
```typescript
// Prima di ogni operazione sensibile
if (!adapter.isAuthorized()) {
  await adapter.authorize();
}
```

---

## Riferimenti Ufficiali
- [Solana Wallet Adapter Docs](https://github.com/solana-labs/wallet-adapter)
- [Solana Mobile Wallet Adapter](https://github.com/solana-mobile/mobile-wallet-adapter)
- [Esempi React](https://github.com/solana-labs/wallet-adapter/tree/master/packages/core/react)
- [Esempi Vanilla JS](https://github.com/solana-labs/wallet-adapter/tree/master/packages/core/base)

---

## Conclusioni
- Gestire la presenza e inizializzazione di `window.wallet` in modo esplicito.
- Estrarre e convertire la publicKey secondo il formato e la piattaforma.
- Gestire la selezione adapter e la compatibilità multi-wallet.
- Usare eventi ufficiali per aggiornare la UI.
- Gestire la sessione mobile e la re-authorization.

Adottare queste pratiche garantisce compatibilità, sicurezza e una migliore esperienza utente su tutte le piattaforme Solana.