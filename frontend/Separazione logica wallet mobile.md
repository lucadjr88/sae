# Piano di Refactoring: Separazione Logica Mobile

## Obiettivo
Rendere la logica mobile completamente modulare e separata dalla logica desktop, evitando interferenze e facilitando manutenzione, test e estensioni future.

---

## Step 1: Creazione file dedicato
- Creare un nuovo file: `src/services/mobile_wallet.ts`
- Tutta la logica di gestione wallet Solana Mobile (adapter, connect, authorize, publicKey, session) sarà contenuta qui.

---

## Step 2: API del modulo mobile
- Esporre funzioni e classi specifiche:
  - `initializeMobileWallet()`
  - `connectMobileWallet()`
  - `getMobilePublicKey()`
  - `isMobileSessionValid()`
  - Eventi: `onMobileConnect`, `onMobileDisconnect`, ecc.
- Nessuna dipendenza da adapter desktop.

---

## Step 3: Separazione stato e variabili
- Usare variabili locali o esportate dal modulo mobile, mai variabili globali condivise.
- Evitare l’uso di `window.wallet` per la logica mobile.
- Esporre solo ciò che serve alla UI tramite funzioni/oggetti del modulo.

---

## Step 4: Gestione publicKey e sessione
- Gestire la conversione base64→base58 all’interno del modulo mobile.
- Esporre la publicKey sempre in formato base58.
- Gestire la sessione mobile e la re-authorization.

---

## Step 5: Eventi e UI
- Esporre eventi custom (es. `onMobileConnect`) tramite callback o EventEmitter.
- La UI mobile ascolta solo eventi del modulo mobile.
- Nessuna dipendenza da eventi desktop.

---

## Step 6: Integrazione in main.ts
- In `main.ts`, rilevare la piattaforma (desktop/mobile).
- Se mobile, importare e usare solo le API di `mobile_wallet.ts`.
- Se desktop, usare la logica desktop esistente.
- Nessuna istanza o variabile condivisa tra i due mondi.

---

## Step 7: Test e validazione
- Testare la logica mobile separatamente.
- Verificare che desktop e mobile funzionino in modo indipendente.
- Validare la conversione publicKey e la gestione sessione.

---

## Esempio struttura mobile_wallet.ts
```typescript
// src/services/mobile_wallet.ts
export function initializeMobileWallet() { /* ... */ }
export async function connectMobileWallet() { /* ... */ }
export function getMobilePublicKey(): string { /* ... */ }
export function isMobileSessionValid(): boolean { /* ... */ }
export function onMobileConnect(cb: (pubkey: string) => void) { /* ... */ }
// ...altre funzioni
```

---

## Vantaggi
- Separazione netta tra desktop e mobile.
- Nessuna interferenza di stato.
- Facilità di manutenzione e test.
- Possibilità di estendere la logica mobile senza impattare il desktop.

---

## Prossimi passi
- Implementare il modulo mobile_wallet.ts secondo questo piano.
- Aggiornare main.ts per usare la logica mobile solo su piattaforma mobile.
- Correggere eventuali errori ed eseguire i test.