# UI — Funzionalità Resource

## Panoramica

Dopo ogni analisi del profilo, la UI carica in parallelo due viste nella stessa area risultati:

- **Fee view** — breakdown fee SAGE per flotta/operazione (default visibile)
- **Resource view** — flussi di risorse materiali (claimed / burned) per la finestra temporale analizzata

La commutazione tra le due viste avviene tramite il **toggle switch verticale** nella sidebar. Nessuna nuova richiesta API viene effettuata: entrambe le viste sono calcolate dalla stessa risposta `/api/analyze-profile`.

---

## Toggle Switch

### Posizione e struttura DOM

Il toggle è un elemento `<label class="vertical-switch">` con un `<input type="checkbox">` nascosto, montato nel contenitore `#toggleSwitchContainer` della sidebar (file: `frontend/src/ui/elements/sideBar.ts`).

Il markup è generato da `toggleSwitchHTML` (file: `frontend/src/ui/elements/toggleSwitch.ts`):

```
sidebar
└── #toggleSwitchContainer .toggle-switch-container
    └── label.vertical-switch
        ├── input[type=checkbox]          ← stato interno (true = Fee, false = Resource)
        └── span.slider
            ├── span.toggleSwitch-icon    ← icona tasse (alto)
            └── span.toggleSwitch-icon    ← icona risorse (basso)
```

### Comportamento visivo (CSS: `toggleSwitch.css`)

| Stato checkbox | Vista attiva | Posizione pallino |
|---|---|---|
| `checked = true` | Fee | In alto (`translateY(0)`) — icone tasse coperta |
| `checked = false` | Resource | In basso (`translateY(60px)`) — icona risorse coperta |

Il pallino `.slider:before` ha altezza 64px su uno switch alto 120px. La transizione è `0.4s ease-in-out`.

Su mobile il container usa `position: fixed; top: 50%; transform: translateY(-50%)` per restare centrato verticalmente.

### Logica di commutazione (`toggleSwitch.ts`)

`initializeToggleSwitch()` viene chiamato da `displayFeeResults()` dopo ogni analisi e:

1. Forzza `checked = true` (Fee view) come stato iniziale.
2. Registra un listener su `change` che chiama `resultDiv.replaceChildren()` con la vista corrispondente dalla cache.

```
change event
├── checked = false  →  resultDiv.replaceChildren(cachedResourceView || placeholder)
└── checked = true   →  resultDiv.replaceChildren(cachedFeeView)
```

Le due viste vengono memorizzate via:

- `setCachedFeeView(el)` — chiamato al termine di `displayFeeResults()`
- `setCachedResourceView(el)` — chiamato al termine di `displayResourceResults()`

Se `cachedResourceView` è null (dati non ancora pronti) viene mostrato un elemento placeholder con testo _"Resources view - coming soon"_.

---

## Resource View — Struttura dati

### Sorgente dati

`displayResourceResults(data)` (file: `frontend/src/ui/elements/resource_playload.ts`) riceve l'oggetto di risposta dell'API e ne estrae il campo `resourceFlows` con fallback a tre path:

```
data.resourceFlows
data.data.resourceFlows
data.breakdown.resourceFlows
```

### Tipo `ResourceFlows`

```ts
type ResourceFlows = {
  profileId?: string;
  timeWindow?: string;           // es. "24h"
  summary?: {
    totalMaterialsIn?: number;
    totalMaterialsOut?: number;
    materialsTracked?: number;
  };
  byMaterial?: Record<string, ResourceMaterial>;
};

type ResourceMaterial = {
  mint?: string;
  name?: string;
  symbol?: string;
  totalIn?: number;
  totalOut?: number;
  net?: number;
  operations?: Record<string, { in: number; out: number; count: number }>;
};
```

---

## Resource View — Layout visivo

### Struttura DOM generata

```
#resourceResults .resource-results
├── .analysis-period          ← periodo e data primo TX analizzato
├── .stats-grid
│   ├── .stat-card            ← "Total Burned / Out" (rosso)
│   └── .stat-card            ← "Total Claimed / In" (verde)
├── h2.section-title          ← "R4 MATERIALS (FOOD / FUEL / AMMO / TOOLKIT)"
├── .resource-flow-table-wrap ← tabella R4
├── h2.section-title          ← "OTHER MATERIALS"
└── .resource-flow-table-wrap ← tabella altri materiali
```

### Header stats

Visibili immediatamente sopra le tabelle, due card:

- **Total Burned / Out** — somma di tutti i `totalOut` del payload summary (classe `resource-stat-burned`, colore `#ce4f4f`)
- **Total Claimed / In** — somma di tutti i `totalIn` del payload summary (classe `resource-stat-claimed`, colore `#49c89a`)

---

## Resource Flow Table

Ogni tabella (R4 e Other) ha la stessa struttura.

### Griglia di layout

CSS: `grid-template-columns: 180px minmax(0, 1fr)` (desktop) / `130px minmax(0, 1fr)` (mobile).

Due colonne per ogni riga materiale:

| Colonna | Contenuto |
|---|---|
| `.resource-material-cell` | icona + nome + simbolo + freccia expand |
| `.resource-flow-cell` | dual-track bar + valori inline |

### Riga materiale (`.resource-flow-row`)

```
.resource-flow-row
├── .resource-material-cell
│   └── .resource-material-entry
│       ├── img.resource-material-icon   ← icona dal CSV catalogo
│       ├── .resource-material-text
│       │   ├── .resource-material-name  ← nome leggibile
│       │   └── .resource-material-symbol
│       └── .resource-flow-arrow ▼       ← solo se ha dati per operazioni
└── .resource-flow-cell
    └── .resource-flow-dual
        └── .resource-flow-bar-dual-track
            ├── .resource-flow-bar-row   ← barra verde (Claimed/In)
            │   └── .resource-flow-bar.resource-flow-bar-in [width=%]
            │       └── span.resource-flow-value-inline  ← valore numerico
            └── .resource-flow-bar-row   ← barra rossa (Burned/Out)
                └── .resource-flow-bar.resource-flow-bar-out [width=%]
                    └── span.resource-flow-value-inline  ← valore numerico
```

### Dual-track bar

Le due barre (verde/rossa) sono proporzionali tra loro: il valore massimo tra `totalIn` e `totalOut` occupa il 100% della larghezza, l'altro è scalato di conseguenza:

```
rowMax = Math.max(totalIn, totalOut)
inPct  = (totalIn  / rowMax) * 100
outPct = (totalOut / rowMax) * 100
```

Colori:
- Barra In (claimed): `#295b49` (verde scuro)
- Barra Out (burned): `#552121` (rosso scuro)

Le righe con `totalIn === totalOut` vengono **escluse** dal rendering.

### Espansione dettaglio operazioni

Le righe con dati per operazione (`material.operations` non vuoto) ottengono la classe `has-toggle` e a click espandono un pannello `.resource-flow-details` che contiene:

```
.resource-flow-details (hidden → display: block al click)
└── .resource-ops-layout
    ├── table.resource-ops-table         ← dettaglio per operazione
    │   ├── thead: Operation | Claimed | Burned | Count
    │   └── tbody: una riga per operazione
    │       ├── .resource-op-name
    │       ├── valore Claimed (verde #49c89a)
    │       ├── valore Burned  (rosso #ce4f4f)
    │       └── count
    └── .resource-summary
        ├── table.summary-ops-table      ← Net stimato in 7 giorni
        └── table.summary-ops-table      ← Net stimato in 30 giorni
```

I valori "Net in 7 days" e "Net in 30 days" sono **proiezioni lineari** calcolate dalla finestra di 24h:

```
net_24h = totalIn - totalOut
net_7   = net_24h * 7
net_30  = net_24h * 30
```

Il colore è verde se `net >= 0`, rosso altrimenti.

Le operazioni nella tabella dettaglio vengono normalizzate tramite `normalizeOpName()` (stesso helper usato nella fee view) e aggregate per nome normalizzato.

---

## Catalogo Materiali

File: `frontend/src/assets/staratlas_resource_mint_image.csv`

Colonne richieste: `mint`, `image_url`, `name`, `symbol`.

Al boot il CSV viene parsato in `RESOURCE_CATALOG` con due indici:

- `byMint` — lookup diretto per indirizzo mint
- `bySymbol` — lookup con chiave normalizzata (lowercase, solo `[a-z0-9]`)

La risoluzione del nome e immagine segue questa priorità:

```
1. catalogEntry.name         (CSV)
2. material.name             (backend)
3. catalogEntry.symbol       (CSV)
4. material.symbol           (backend)
5. "Token <mint[:8]>..."     (fallback)
```

In caso di errore caricamento immagine, viene tentato il candidato successivo in coda. Se tutti falliscono, il tag `<img>` viene rimosso dal DOM.

### Token esclusi

Il token ATLAS (`ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx`) è filtrato via `HIDDEN_RESOURCE_MINTS` e non compare mai nella lista.

---

## Separazione R4 vs Other Materials

La funzione `isR4Material()` classifica R4 basandosi su mint address, nome o simbolo. Riconosce: `food`, `fuel`, `ammo`, `toolkit`, `repairkit`, `rkit`.

Le entry vengono separate in due liste e rese in due tabelle distinte:
- **R4 Materials** — risorse di consumo flotta (Food, Fuel, Ammo, Toolkit)
- **Other Materials** — tutti gli altri token

Entrambe le tabelle usano `buildResourceFlowTable()` con un messaggio di stato vuoto personalizzato.

---

## Integrazione con Fee View

Il ciclo di vita completo per ogni analisi:

```
analyzeFees()
├── fetch /api/analyze-profile
├── displayFeeResults(data)          → setCachedFeeView()  + initializeToggleSwitch()
└── displayResourceResults(data)     → setCachedResourceView()
```

`initializeToggleSwitch()` registra il listener sul toggle. A questo punto entrambe le view sono in cache e la commutazione è istantanea (nessuna re-fetch).

### Wipe & Reload

Se l'utente esegue Wipe & Reload dalla tooltip della cache mentre è attiva la Resource view, il file `wipe_reload.ts` intercetta lo stato corrente (`wasResourceView`), esegue il reload, e poi riporta automaticamente il toggle su Fee view (`toggleSwitch.checked = false` + `dispatchEvent('change')`).

---

## File coinvolti

| File | Ruolo |
|---|---|
| `frontend/src/ui/elements/resource_playload.ts` | Renderer completo della resource view |
| `frontend/src/ui/elements/toggleSwitch.ts` | Markup, cache viste, logica commutazione |
| `frontend/src/ui/styles/resource_playload.css` | Stili tabelle e barre resource |
| `frontend/src/ui/styles/toggleSwitch.css` | Stile widget toggle verticale |
| `frontend/src/services/api.ts` | Chiama `displayResourceResults()` dopo l'analisi |
| `frontend/src/services/wipe_reload.ts` | Gestisce reset toggle su wipe |
| `frontend/src/assets/staratlas_resource_mint_image.csv` | Catalogo immagini/nomi materiali |
