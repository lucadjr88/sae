# Proposta Patch: Migrazione a solana-mobile-adapter per Compatibilità Mobile

## Obiettivo

Sostituire l'uso di `solana-wallet-adapter` con `solana-mobile-adapter` nella versione mobile dell'applicazione, mantenendo la compatibilità desktop e garantendo modularità e minima invasività.

---

## Motivazione

- `solana-wallet-adapter` non è ottimizzato per ambienti mobile e presenta limiti di UX e compatibilità.
- `solana-mobile-adapter` offre un'integrazione nativa e user-friendly per dispositivi mobili, migliorando onboarding e sicurezza.

---

## Strategia di Patch

1. **Rilevamento piattaforma**: Introdurre un modulo di detection per distinguere ambiente mobile/desktop.
2. **Modularizzazione Adapter**: Creare un wrapper che esporta l'adapter corretto in base al device.
3. **Refactor Import**: Sostituire gli import diretti di `solana-wallet-adapter` con il nuovo wrapper.
4. **Gestione fallback**: In caso di ambiente non supportato, fallback a desktop adapter.

---

## Esempio di Implementazione

### 1. Nuovo modulo adapter

**src/services/wallet-adapter.ts**

```ts
import { isMobile } from '../utils/mobile';

let walletAdapter;

if (isMobile()) {
  // Import dinamico per evitare bundle desktop
  walletAdapter = await import('solana-mobile-adapter');
} else {
  walletAdapter = await import('solana-wallet-adapter');
}

export default walletAdapter;
```

### 2. Utilizzo centralizzato

Sostituire in tutti i punti:

```ts
import { WalletAdapter } from 'solana-wallet-adapter';
```

con:

```ts
import walletAdapter from '../services/wallet-adapter';
```

---

## Vantaggi
- **Minima invasività**: Nessuna modifica alle logiche di business.
- **Modularità**: Un solo punto di gestione per la selezione dell'adapter.
- **Scalabilità**: Facile estensione per altri ambienti/wallet.

---

## Note
- Verificare che le API di `solana-mobile-adapter` siano compatibili o adattare il wrapper.
- Aggiornare la documentazione di onboarding per mobile.
- Testare fallback e UX su dispositivi reali.

---

## Conclusione

Questa patch consente una transizione graduale e modulare verso il supporto mobile, migliorando l'esperienza utente senza impattare la versione desktop.