# Valutazione Modifiche Minimali: Nascondi Homepage e Mostra Form Manuale

## Requisito
- Nascondere completamente la homepage con i pulsanti "CONNECT WALLET" e "ENTER NO WALLET"
- Mostrare direttamente il form di inserimento manuale al caricamento
- Non toccare logica o backend
- Modifiche minimali esclusivamente sul frontend

---

## Flusso Attuale

```
main.ts:114
  ↓
createHomePage()  [hompage.ts:29]
  ├─ Background
  ├─ HeroTitle
  ├─ StartButtons  ← CONTIENE I DUE PULSANTI DA NASCONDERE
  │   ├─ "CONNECT WALLET" btn (id: connectWalletBtn)
  │   └─ "ENTER NO WALLET" btn (id: enterNoWalletBtn)
  ├─ PrivacyPolicy
  └─ FootBar
  
User clicks "ENTER NO WALLET"
  ↓
manualProfileEntryListener() [hompage.ts:218]
  ├─ Svuota buttons-container
  └─ Inserisce createManualLoginElement()
     └─ Mostra form con input "profileId"
```

---

## Approccio Consigliato: MINIMALE (2 righe)

**File: `frontend/src/main.ts` (attorno a linea 114)**

### Modifica
Sostituire la sequenza:
```typescript
createHomePage();
// ... event listeners su connectBtn e enterNoWBtn ...
```

Con:
```typescript
// Skip homepage, go directly to manual entry form
{
  const mainContainer = document.querySelector<HTMLDivElement>('#mainContainer')!;
  mainContainer.innerHTML = '';
  const div = document.createElement('div');
  div.id = 'buttons-container';
  mainContainer.appendChild(div);
  manualProfileEntryListener();
}
```

**Linee toccate:** ~8 righe di codice in `main.ts`  
**File toccati:** 1 solo file  
**Effetto:** La homepage non viene mai renderizzata; il form manuale appare al caricamento

---

## Approcci Alternativi

### Approccio B: Condizionale in createHomePage()

**File: `frontend/src/hompage.ts` (linea 45)**

Modificare la creazione dei button container:
```typescript
const startDiv = document.createElement('div');
startDiv.id = 'buttons-container';
// CONDIZIONALE: se skipWalletPage = true, inserisci direttamente form manuale
if (!window.skipWalletPage) {
  startDiv.appendChild(createStartButtonsElement());
} else {
  startDiv.appendChild(createManualLoginElement());
}
mainContainer.appendChild(startDiv);
```

E in `main.ts` prima di `createHomePage()`:
```typescript
(window as any).skipWalletPage = true;
createHomePage();
```

**Linee toccate:** 4 righe in `hompage.ts` + 1 riga in `main.ts`  
**File toccati:** 2 file  
**Pro:** Mantiene la struttura homepage intatta  
**Contro:** Un po' più invasivo

### Approccio C: CSS display:none

**File: `frontend/src/ui/styles/startButtons.css`**

```css
.start-buttons {
  display: none !important;
}
```

**Linee toccate:** 2 righe CSS  
**File toccati:** 1 file  
**Pro:** Semplicissimo  
**Contro:** I pulsanti rimangono nel DOM ma nascosti; l'evento `manualProfileEntryListener()` deve ancora essere innescato manualmente; la homepage appare comunque (solo senza pulsanti)

---

## Analisi Dettagliata per Approccio Consigliato (Minimale)

### Stato Iniziale (main.ts, linee ~114-150)
```typescript
createHomePage();

const connectBtn = document.getElementById('connectWalletBtn') as HTMLButtonElement | null;
const enterNoWBtn = document.getElementById('enterNoWalletBtn') as HTMLButtonElement | null;

if (connectBtn) {
  connectBtn.disabled = false;
  connectBtn.addEventListener('click', () => { ... });
}

window.addEventListener('walletStateChanged', async () => { ... });

if (enterNoWBtn) {
  enterNoWBtn.addEventListener('click', () => {
    manualProfileEntryListener()
  });
}
```

### Modifica Minimale
```typescript
// OPZIONE 1: Sostituire createHomePage() con questa logica
if (false) {  // Flag for future toggle
  createHomePage();
} else {
  // Skip homepage, show manual entry form directly
  const mainContainer = document.querySelector<HTMLDivElement>('#mainContainer')!;
  mainContainer.innerHTML = '';
  const div = document.createElement('div');
  div.id = 'buttons-container';
  mainContainer.appendChild(div);
  manualProfileEntryListener();
}

// Rimuovere i listener su connectBtn e enterNoWBtn (non necessari più)
// Mantenere wallet initialization logic intact (linee prima di createHomePage)
```

**Cosa accade:**
1. La homepage non viene mai disegnata
2. Il form manuale appare direttamente al caricamento
3. Lo stato wallet viene comunque inizializzato (logica preserved)
4. Nessun backend toccato, nessuna logica modificata
5. Il pulsante "CONNECT WALLET" non è mai stato creato

---

## Impatto e Verifiche

| Aspetto | Stato |
|---------|-------|
| Homepage visibile | NO (skippata) |
| Form manuale visibile | SI (diretto) |
| Wallet connect disponibile | NO |
| Backend modificato | NO |
| Logica profile analisi | NO (preserved) |
| API calls | NO (preserved) |
| Mobile wallet compat | SI (preserved) |
| Privacy policy footer | DIPENDE DA APPROCCIO |

### Note per Approccio Minimale
- La homepage (background, hero title, privacy, footer) **non viene renderizzata**
- Se vuoi mantenere il background/title/footer, usa **Approccio B**
- Il caching e la logica di analisi rimangono intatti (API non toccate)

---

## Raccomandazione

**Usa Approccio Minimale** se:
- Vuoi solo il form di input, niente homepage
- Vuoi il commit più piccolo possibile
- Vuoi evitare toccare altri file

**Usa Approccio B** se:
- Vuoi mantenere il background/hero/footer visibili
- Preferisci un flag condizionale riutilizzabile

**Evita Approccio C** perché:
- Lascia codice inutile nel DOM
- Richiede comunque trigger manuale per il form

---

## File da Modificare (Approccio Minimale)

- ✅ `frontend/src/main.ts` → Linee ~114-150 (~8 righe alterate)
- ✅ Nessun altro file richiede modifiche
- ✅ Nessun backend toccato
- ✅ Nessuna dipendenza esterna alterata
