# Proposta di unificazione delle finestre `rental_detail` e `list_detail`

## Obiettivo

Uniformare la creazione delle finestre modali usate da:

- `createRentalContractWindow()` in `frontend/src/ui/elements/rental_detail.ts`
- `createListingDetailWindow()` in `frontend/src/ui/elements/list_detail.ts`

L’obiettivo non è fondere la logica di business (`acceptRental` vs `listFleet`), ma **estrarre la parte UI comune** per ridurre duplicazione, rendere il codice più coerente e facilitare la manutenzione.

---

## Valutazione rapida

**Fattibilità:** alta ✅  
**Rischio funzionale:** basso, se si separa bene il “guscio” della finestra dalla logica specifica.  
**Convenienza:** buona, perché le due funzioni condividono già gran parte del ciclo di vita della modale.

---

## Confronto tra le due funzioni

| Area | `createRentalContractWindow` | `createListingDetailWindow` | Nota |
|---|---|---|---|
| Overlay | Crea un `div` overlay e chiude al click esterno | Stesso pattern | Duplicazione diretta |
| Root window | Crea `div` con id/classe e `zIndex` | Stesso pattern | Duplicazione diretta |
| Header | Titolo + bottone `X` | Titolo + bottone `X` | Struttura quasi identica |
| Mount/unmount | `appendChild` su `body`, rimozione manuale | Idem | Da centralizzare |
| Styling | Usa `rentalContractOverlay` e `rental-contract-window` | Riusa le stesse classi base | Già predisposto alla convergenza |
| Contenuto | Dettagli contratto, fetch backend, CTA `Rent` | Select fleet, input rate, CTA `List` | Parte specifica da lasciare separata |
| Event binding | Close, input, fetch, submit | Close, select, submit | Solo parte close/layout è condivisibile |

---

## Duplicazioni concrete da rimuovere

### 1. Creazione e rimozione overlay
Entrambe le funzioni:

- creano un overlay full-screen;
- chiudono la finestra se il click avviene sull’overlay;
- rimuovono overlay e finestra dal DOM.

Questa logica può vivere in una utility unica, ad esempio:

- `createBaseDialog()`
- oppure `openModalWindow()` / `closeModalWindow()`

### 2. Struttura HTML del contenitore
Le due finestre condividono già il medesimo schema:

```html
<div class="window-header">
  <h2>...</h2>
  <button class="closeWindow">×</button>
</div>
<div class="window-content">...</div>
```

Questa è la parte migliore da astrarre in un componente/factory comune.

### 3. Gestione del ciclo di vita DOM
Oggi ogni funzione gestisce da sola:

- creazione nodi;
- append al `body`;
- cleanup;
- ricerca di elementi tramite `document.getElementById()` / `querySelector()`.

Un wrapper comune potrebbe restituire direttamente i riferimenti già pronti:

- `overlay`
- `windowEl`
- `contentEl`
- `close()`

### 4. Pattern di chiusura ripetuto
In `rental_detail.ts` la chiusura viene ripetuta in più punti:

- click sul bottone `X`;
- click sull’overlay;
- callback `onSuccess` di `rentTx()`.

In `list_detail.ts` esiste già una mini utility (`removeListingDetailWindow()`), che conferma il bisogno di una primitive comune di cleanup.

---

## Differenze che **non** vanno fuse

La modularizzazione deve fermarsi al livello giusto. Le seguenti parti devono restare separate:

### `rental_detail.ts`
Responsabilità specifiche:

- mostrare i dettagli del contratto;
- fare `fetch('/api/getFleetInfoMinimal')`;
- renderizzare fuel/ammo/crew/cargo;
- gestire durata, totale prezzo e submit `rentTx()`.

### `list_detail.ts`
Responsabilità specifiche:

- preparare la select delle fleet listabili;
- validare `ratePerDay`;
- chiamare `listFleetTx()`;
- gestire busy-state del bottone `List`.

Quindi: **unificare la finestra, non la logica applicativa**.

---

## Strategia consigliata

## 1. Estrarre una factory comune della modale

Una possibile forma:

```ts
interface BaseDialogOptions {
  id: string;
  title: string;
  overlayClass?: string[];
  windowClass?: string[];
  closeOnOverlay?: boolean;
}

interface BaseDialogHandle {
  overlay: HTMLDivElement;
  windowEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  close: () => void;
}
```

La factory dovrebbe occuparsi solo di:

- rimuovere eventuali istanze precedenti;
- creare overlay e shell;
- renderizzare header standard;
- appendere la finestra al DOM;
- esporre `close()`.

---

## 2. Lasciare due wrapper specifici

Dopo l’estrazione, le due funzioni restano pubbliche e stabili:

- `createRentalContractWindow(...)`
- `createListingDetailWindow(...)`

ma diventano **wrapper sottili** che:

1. chiamano la factory comune;
2. popolano `contentEl` con il proprio contenuto;
3. agganciano solo gli event listener specifici.

Questo mantiene intatti gli entry point del progetto e riduce il rischio di regressioni.

---

## 3. Estrarre helper secondari opzionali

Dopo la factory base, ci sono altri punti candidati alla modularizzazione:

### a) Header e close button
Se la factory genera già header e close button, il codice duplicato scompare quasi del tutto.

### b) Loading / error card
`rental_detail.ts` usa card di caricamento ed errore che possono diventare helper riutilizzabili:

- `renderLoadingCard(text)`
- `renderErrorCard(message)`

### c) Busy state dei pulsanti
Sia `List` che `Rent` hanno uno stato di abilitazione/disabilitazione. Una micro utility tipo `setButtonBusyState()` renderebbe il comportamento più uniforme.

---

## Problemi strutturali che l’unificazione aiuterebbe a risolvere

### 1. Query globali troppo larghe
In più punti si usa:

- `document.getElementById(...)`
- `document.querySelector(...)`

Per finestre modali è più robusto interrogare il DOM **a partire dal root della finestra**, ad esempio `windowEl.querySelector(...)`.

Questo evita collisioni future se dovessero esistere più dialoghi o componenti con ID simili.

### 2. HTML inline + event binding sparsi
Entrambe le funzioni mescolano:

- HTML string template;
- selezione elementi;
- logica di validazione;
- submit async.

Con una shell comune, i file restano focalizzati sul proprio compito e diventano più leggibili.

### 3. Cleanup non uniforme
Oggi la rimozione avviene con strategie leggermente diverse (`getElementById`, `querySelector`, class lookup). Una `close()` unica rende il comportamento coerente.

---

## Sequenza di refactor consigliata

1. **Introdurre una utility base** per creare/chiudere una modale.
2. **Far convergere prima la parte estetica e di lifecycle**:
   - overlay
   - header
   - close button
   - append/remove DOM
3. **Mantenere invariata la logica specifica** di `rentTx()` e `listFleetTx()`.
4. Solo in un secondo momento, valutare helper aggiuntivi per:
   - loading/error states;
   - button busy-state;
   - input numerici con `+ / -`.

Questo approccio è incrementale e sicuro.

---

## Piano operativo minimale

Per ridurre il rischio, il refactor può essere eseguito in **3 micro-step**.

### Step 1 — introdurre solo la shell comune
Creare `frontend/src/ui/elements/modal_base.ts` con una funzione molto piccola, ad esempio `createBaseDialog()`.

Responsabilità uniche del nuovo modulo:

- creare overlay e finestra;
- renderizzare header standard con titolo e bottone `X`;
- chiudere su click esterno;
- esporre `contentEl` e `close()`.

> In questo step non si cambia nessuna logica di `rentTx()` o `listFleetTx()`.

### Step 2 — migrare `list_detail.ts` per primo
Conviene partire da `createListingDetailWindow()` perché è più semplice:

- niente fetch di dettagli backend;
- meno rendering dinamico;
- flusso submit più lineare.

Intervento minimo:

1. sostituire la creazione manuale di overlay + header con `createBaseDialog()`;
2. lasciare invariati `normalizeFleetOption()`, `submitListing()` e i listener attuali;
3. usare `contentEl.querySelector(...)` invece di query globali dove possibile.

### Step 3 — migrare `rental_detail.ts`
Solo dopo aver stabilizzato `list_detail.ts`, applicare lo stesso pattern a `createRentalContractWindow()`:

- shell della modale delegata a `modal_base.ts`;
- contenuto dettagli, fetch API e CTA `Rent` lasciati nel file corrente;
- sostituzione dei punti di chiusura ripetuti con una singola `close()`.

---

## Criteri di accettazione minimi

Il refactor può considerarsi corretto se, al termine:

- l’apertura e chiusura delle due finestre resta invariata lato utente;
- `List` continua a funzionare senza regressioni;
- `Rent` continua a mostrare dettagli, totale e submit correttamente;
- non vengono introdotti cambiamenti ai contratti pubblici delle due funzioni esportate.

---

## Struttura target suggerita

```text
frontend/src/ui/elements/
  modal_base.ts          # crea overlay, shell, header, close()
  rental_detail.ts       # contenuto e logica acceptRental
  list_detail.ts         # contenuto e logica listFleet
```

In alternativa, se vuoi tenere tutto più vicino all’UI:

```text
frontend/src/ui/elements/windows/
  base_dialog.ts
  rental_contract_window.ts
  listing_detail_window.ts
```

---

## Benefici attesi

- **meno codice duplicato**;
- **chiusura/modifica delle modali più semplice**;
- **maggiore uniformità visiva e comportamentale**;
- **minor rischio di bug sul lifecycle DOM**;
- **più facile aggiungere nuove finestre** (`cancel`, `delist`, `details`, ecc.).

---

## Conclusione

Le due funzioni sono già abbastanza vicine da giustificare una **modularizzazione della shell della finestra**.  
La scelta migliore è introdurre una **factory comune della modale** e lasciare separate le logiche di dominio:

- `createRentalContractWindow()` continua a gestire il flusso `acceptRental`;
- `createListingDetailWindow()` continua a gestire il flusso `listFleet`.

Questa è la soluzione più pulita per uniformare il codice **senza forzare un accorpamento improprio della business logic**.
