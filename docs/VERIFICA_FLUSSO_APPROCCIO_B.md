# Verifica Flusso Completo: Approccio B (Condizionale)

## Stato Iniziale (Corrente)

### Flusso Attuale (skipWalletPage = false)
```
CARICAMENTO PAGINA
    ↓
main.ts:83+ → Wallet initialization (mobile/desktop)
    ↓
main.ts:90+ → walletStateChanged listener setup
    ↓
main.ts:114 → createHomePage()
    ├─ hompage.ts:29 → createHomePage()
    │  ├─ Clear mainContainer
    │  ├─ Append background
    │  ├─ Append hero title
    │  ├─ Append buttons-container
    │  │  └─ Append createStartButtonsElement()
    │  │     ├─ Button: "CONNECT WALLET" (id: connectWalletBtn)
    │  │     └─ Button: "ENTER NO WALLET" (id: enterNoWalletBtn)
    │  ├─ Append privacy policy
    │  └─ Append footer
    │
    └─ HTML NOW: [Background] [Hero] [2 Buttons] [Privacy] [Footer]

main.ts:115+ → Connect button listener setup
    ├─ connectBtn.addEventListener('click')
    │  └─ wallet.connect() → Phantom/Solflare modal
    │
main.ts:126+ → Wallet state listener
    └─ Triggered on wallet connection
       ├─ Get public key + icon
       ├─ Set global state
       └─ Call getWalletConnection()

main.ts:143+ → "Enter No Wallet" button listener setup
    └─ enterNoWBtn.addEventListener('click')
       └─ manualProfileEntryListener()
          ├─ Find buttons-container
          ├─ Clear innerHTML
          ├─ Append createManualLoginElement()
          │  ├─ Input: profileId
          │  ├─ Datalist: suggestions
          │  ├─ Button: Analyze
          │  └─ Alert: instructions
          ├─ Populate datalist with getRecentProfileIds()
          └─ Analyze button listener
             └─ On click:
                ├─ Get input value
                ├─ Save to cache (saveProfileIdToCache)
                ├─ Append loading element
                └─ Call analyzeFees(profileId)
                   └─ API call to backend

USER SEES: [Background] [Hero] [2 Buttons] [Privacy] [Footer]

USER CLICKS "ENTER NO WALLET"
    ↓
USER SEES: [Background] [Hero] [Form] [Privacy] [Footer]
    ├─ Input field
    ├─ Datalist with suggestions
    ├─ Analyze button
    └─ Instructions alert

USER ENTERS PROFILE ID & CLICKS ANALYZE
    ↓
analyzeFees(profileId)
    └─ Backend API call
       └─ Results rendered in #results div
```

---

## Approccio B: Con Flag Condizionale

### Flusso Modificato (skipWalletPage = true)

```
CARICAMENTO PAGINA
    ↓
main.ts:83+ → Wallet initialization (mobile/desktop)
    │
    ├─ isMobile?
    │  └─ initializeMobileWallet() + onMobileConnect()
    │
    └─ Desktop:
       └─ window.wallet = new Wallet()
       ├─ NO listener setup per mobile connect
       ├─ Mobile event trigger: onMobileConnect()
       │  └─ Dispatch walletStateChanged event
    │
main.ts:90+ → walletStateChanged listener setup
    └─ Listener ATTIVO ma non triggerato (nessuna connessione)
    │
main.ts:112 → [NEW] Set flag
    │   (window as any).skipWalletPage = true;
    │
main.ts:114 → createHomePage()
    └─ hompage.ts:29 → createHomePage()
       ├─ Clear mainContainer
       ├─ Append background
       ├─ Append hero title
       ├─ Append buttons-container (EMPTY!)
       │  ├─ Check: if (!window.skipWalletPage) → FALSE
       │  ├─ SKIP createStartButtonsElement()
       │  ├─ NO appendChild of buttons
       │  └─ Container remains EMPTY with only id
       │
       ├─ Append privacy policy
       └─ Append footer
       │
       HTML NOW: [Background] [Hero] [Empty Container] [Privacy] [Footer]

main.ts:115+ → Connect button listener setup (NO-OP)
    ├─ connectBtn = getElementById('connectWalletBtn')
    ├─ connectBtn === NULL (button doesn't exist!)
    ├─ if (connectBtn) → FALSE
    └─ Listener NOT added (safe, no error)

main.ts:126+ → Wallet state listener
    └─ Listener ATTIVO, ready if wallet connects
       ├─ But since we skip wallet UI, unlikely to trigger
       └─ Safe to keep (won't interfere)

main.ts:143+ → "Enter No Wallet" button listener setup (NO-OP)
    ├─ enterNoWBtn = getElementById('enterNoWalletBtn')
    ├─ enterNoWBtn === NULL (button doesn't exist!)
    ├─ if (enterNoWBtn) → FALSE
    └─ Listener NOT added (safe, no error)

main.ts:148 → [NEW] Call manual entry directly
    └─ manualProfileEntryListener()
       ├─ Find buttons-container (EXISTS, id was set in createHomePage)
       ├─ Clear innerHTML (was empty anyway)
       ├─ Append createManualLoginElement()
       │  ├─ Input: profileId
       │  ├─ Datalist: profileId-suggestions
       │  ├─ Button: Analyze (id: analyzeBtn)
       │  └─ Alert: instructions (id: allert_istruzioni)
       │
       ├─ Populate datalist:
       │  └─ const datalist = buttonsContainer.querySelector('#profileId-suggestions')
       │     └─ innerHTML = getRecentProfileIds().map(...)
       │        └─ localStorage.getItem('recentProfileIds') from cache
       │
       └─ Setup Analyze button listener:
          ├─ analyzeBtn = buttonsContainer.querySelector('#analyzeBtn')
          ├─ analyzeBtn.addEventListener('click', ...)
          └─ On click:
             ├─ profileId = getElementById('#profileId').value
             ├─ if (!profileId) return
             ├─ allert_istruzioni?.remove()
             ├─ saveProfileIdToCache(profileId)
             │  └─ Update localStorage
             ├─ loading = createLoadingElement(...)
             ├─ buttonsContainer.appendChild(loading)
             └─ analyzeFees(profileId)
                └─ Import from '@/services/api'
                   └─ Backend API call

USER SEES: [Background] [Hero] [Form] [Privacy] [Footer]
├─ Input field: "Player Profile ID"
├─ Datalist suggestions (from cache)
├─ Button: "Analyze"
└─ Instructions alert

USER ENTERS PROFILE ID & CLICKS ANALYZE
    ↓
analyzeFees(profileId)
    └─ API request to backend
       └─ Processing message appears (loading element)
       └─ Results rendered in #results div (within buttons-container)
```

---

## Differenze Critiche

| Elemento | Attuale | Con Approccio B |
|----------|---------|-----------------|
| connectBtn | Creato, listener attivo | NULL, no listener |
| enterNoWBtn | Creato, listener attivo | NULL, no listener |
| Pulsanti wallet | Visibili | Mai creati |
| Form manuale | Visibile dopo click | Visibile al caricamento |
| Background/Hero/Footer | Presenti | Presenti (MANTENUTI!) |
| manualProfileEntryListener | Triggerato da click | Triggerato automaticamente |
| Wallet state listener | Attivo, possibile connessione | Attivo ma non triggerato |

---

## Flusso Completo: Passo dopo Passo (Approccio B)

### STEP 1: Inizializzazione
```
✓ Wallet init (mobile/desktop) → window.wallet ready
✓ walletStateChanged listener → ready (passive)
✓ Flag skipWalletPage = true → set in window
✓ createHomePage() called → structure created
```

### STEP 2: DOM After createHomePage()
```
#mainContainer
├─ #background-container [background image]
├─ #hero-container [Star Atlas title]
├─ #buttons-container [EMPTY div, id set]
├─ #privacy-container [privacy policy link]
├─ #price-ticker-container [footer ticker]
└─ img.character2, img.character3
```

### STEP 3: connectBtn & enterNoWBtn Setup
```
connectBtn = document.getElementById('connectWalletBtn') → NULL
→ if (connectBtn) block skipped → SAFE

enterNoWBtn = document.getElementById('enterNoWalletBtn') → NULL
→ if (enterNoWBtn) block skipped → SAFE
```

### STEP 4: manualProfileEntryListener() Called
```
buttonsContainer = document.getElementById('buttons-container') → FOUND ✓
├─ innerHTML = '' (already empty, no-op)
├─ appendChild(createManualLoginElement())
│  └─ DOM update: adds form to #buttons-container
├─ datalist = querySelector('#profileId-suggestions') → FOUND ✓
│  └─ Populate with getRecentProfileIds()
│     └─ Read from localStorage['recentProfileIds']
└─ analyzeBtn = querySelector('#analyzeBtn') → FOUND ✓
   └─ addEventListener('click', ...)
```

### STEP 5: DOM After manualProfileEntryListener()
```
#mainContainer
├─ #background-container
├─ #hero-container
├─ #buttons-container
│  └─ #ricerca_manuale
│     ├─ div.form-box
│     │  ├─ input#profileId [placeholder]
│     │  ├─ datalist#profileId-suggestions [populated]
│     │  └─ button#analyzeBtn "Analyze"
│     └─ div#results [empty, will be filled]
│     └─ div#allert_istruzioni [instructions]
├─ #privacy-container
├─ #price-ticker-container
└─ img.character2, img.character3
```

### STEP 6: User Enters Profile ID & Clicks Analyze
```
analyzeBtn click listener triggered
├─ profileId = input#profileId.value → "some-profile-id"
├─ if (!profileId) → FALSE, continue
├─ allert_istruzioni?.remove() → removes if exists
├─ saveProfileIdToCache(profileId)
│  └─ localStorage['recentProfileIds'] updated
│     └─ ['some-profile-id', ...previous]
├─ createLoadingElement(...) → creates loading div
├─ buttonsContainer.appendChild(loading) → adds to DOM
└─ analyzeFees(profileId)
   └─ API call: /api/analyzeFees?profileId=...
      └─ Backend processes
      └─ Results returned
      └─ Rendered in #results div
```

### STEP 7: Results Displayed
```
#buttons-container
├─ #ricerca_manuale
│  ├─ form-box [input still visible]
│  ├─ #results [populated with analysis data]
│  └─ #allert_istruzioni [removed]
└─ loading element [removed after API complete]
```

---

## Verifica di Sicurezza: Potenziali Conflitti

### ❌ Conflitto Potenziale #1: connectBtn / enterNoWBtn NULL
**Scenario:** Codice cerca di accedere a pulsanti che non esistono  
**Stato Attuale:** Uso di `if (connectBtn)` prima di operazioni  
**Risultato:** ✅ SAFE - null checks in place

```typescript
const connectBtn = document.getElementById('connectWalletBtn') as HTMLButtonElement | null;
if (connectBtn) {  // ← Guards against NULL
  connectBtn.addEventListener(...);
}
```

### ❌ Conflitto Potenziale #2: walletStateChanged Listener Still Active
**Scenario:** Se wallet si connette, getWalletConnection() viene chiamata  
**Effetto:** Imposta stato wallet globale (benign side effect)  
**Risultato:** ✅ SAFE - non interfere con form flow

### ❌ Conflitto Potenziale #3: manualProfileEntryListener() Called Twice
**Scenario:** Se manualProfileEntryListener() fosse chiamata due volte  
**Come Succede:** 
- Una volta automaticamente in main.ts
- Potenzialmente da codice legacy

**Effetto della duplicazione:**
```typescript
// First call:
buttonsContainer.innerHTML = ''; // clear
buttonsContainer.appendChild(createManualLoginElement()); // add form
// ... setup datalist ...
// ... setup listener ...

// Second call (if it happened):
buttonsContainer.innerHTML = ''; // clear again (removes form!)
buttonsContainer.appendChild(createManualLoginElement()); // re-add form
// ... setup datalist again ...
// ... setup listener again (duplicate!) ...
```

**Risultato:** ⚠️ DUPLICATE LISTENERS on analyzeBtn
- Ogni click triggherebbe 2+ API calls
- Comportamento strano (double loading, etc.)

**Mitigazione:**
- Assicurarsi che manualProfileEntryListener() sia chiamata SOLO UNA VOLTA
- In questo approccio, viene chiamata solo da main.ts linea ~148
- Il vecchio caller (enterNoWBtn click) non esiste più
- ✅ SAFE

### ❌ Conflitto Potenziale #4: Window Flag Race Condition
**Scenario:** Flag `skipWalletPage` settato dopo createHomePage() esecuzione  
**Timeline:**
```
Step A: (window as any).skipWalletPage = true;
        └─ Flag set in window
        
Step B: createHomePage();
        └─ Inside createHomePage(), legge:
           if (!window.skipWalletPage) → FALSE (perché è true)
           └─ Correct behavior ✓
```

**Risultato:** ✅ SAFE - Flag set prima di createHomePage() call

---

## Dipendenze e Importazioni

### Verificate in hompage.ts
```typescript
import { createManualLoginElement } from '@/ui/elements/manualLogin'; ✓
import { createLoadingElement } from '@/ui/elements/loading'; ✓
import { analyzeFees } from '@/services/api'; ✓

export function getRecentProfileIds(): string[] { ... } ✓
export function saveProfileIdToCache(profileId: string) { ... } ✓
export function manualProfileEntryListener() { ... } ✓
```

### Importate in main.ts
```typescript
import { createHomePage, manualProfileEntryListener, getWalletConnection, getWalletIcon } from "@/hompage"; ✓
```

**Risultato:** ✅ TUTTE LE DIPENDENZE GIÀ PRESENTI

---

## Modifiche Minimali Richieste per Approccio B

### File 1: `/home/luca/sae/frontend/src/hompage.ts` (linee ~43-47)

**PRIMA:**
```typescript
const startDiv = document.createElement('div');
startDiv.id = 'buttons-container';
startDiv.appendChild(createStartButtonsElement());

const privacyDiv = document.createElement('div');
```

**DOPO:**
```typescript
const startDiv = document.createElement('div');
startDiv.id = 'buttons-container';
if (!window.skipWalletPage) {
  startDiv.appendChild(createStartButtonsElement());
}

const privacyDiv = document.createElement('div');
```

**Cambio:** 2 righe aggiunte (if + braces), nessuna riga rimossa

---

### File 2: `/home/luca/sae/frontend/src/main.ts` (linee ~111-115)

**PRIMA:**
```typescript
}

createHomePage();
//console.log('[main.ts] Initialization complete...

const connectBtn = document.getElementById...
```

**DOPO:**
```typescript
}

(window as any).skipWalletPage = true;
createHomePage();
manualProfileEntryListener();
//console.log('[main.ts] Initialization complete...

const connectBtn = document.getElementById...
```

**Cambio:** 2 righe aggiunte, nessuna riga rimossa, nessun codice rimosso

**Nota:** Il resto del codice (connectBtn listener, enterNoWBtn listener) rimane intatto.
         Non causa errori perché gli if-guards proteggono contro NULL.

---

## Verifica Finale: No-Conflicts Checklist

- [x] Flag `skipWalletPage` settato prima di createHomePage()
- [x] connectBtn/enterNoWBtn null-safe con if-guards
- [x] walletStateChanged listener non interfiere
- [x] manualProfileEntryListener() chiamata solo una volta
- [x] Tutte le funzioni/importazioni già presenti
- [x] DOM structure valida (buttons-container esiste)
- [x] Backend logic non modificato
- [x] Wallet initialization preserved
- [x] Nessun circular dependency
- [x] Nessun elemento duplicato nel DOM

**RISULTATO:** ✅ FLUSSO VERIFICATO E SICURO
