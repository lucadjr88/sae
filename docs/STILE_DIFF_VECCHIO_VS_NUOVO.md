# Differenze stili: vecchio vs nuovo frontend

Fonte analizzata: `frontend/stile_vecchio_vs_nuovo.css` (sezione **vecchio** vs sezione **nuovo**).

## Sintesi rapida

Il nuovo stile è una versione più modulare e semplificata, ma non è equivalente al vecchio: alcune regole strutturali e di dettaglio sono state rimosse o alterate, con impatto su layout, coerenza visiva e comportamento di alcune sezioni dati.

## Differenze sostanziali

### 1) Strato base pagina e background

- **Vecchio**:
  - reset globale `* { margin/padding/box-sizing }`
  - `body` con `min-height: 100vh`
  - overlay aggiuntivo con `body:after` (gradiente scuro sotto l’hero)
  - background nel `body:before`
- **Nuovo**:
  - niente reset globale
  - niente `min-height` esplicito sul `body`
  - rimosso `body:after`
  - background spostato su `.background-image`

**Impatto**: resa visiva meno “stratificata” nella parte alta, possibile differenza di profondità/contrasto e comportamento altezza pagina.

---

### 2) Sidebar

- **Vecchio**: sidebar `position: fixed` + `padding: 16px 8px`
- **Nuovo**: nella versione incollata iniziale manca `position: fixed` e manca `padding`

**Impatto**: possibile disallineamento/ancoraggio non corretto della colonna laterale rispetto allo scroll.

---

### 3) Hero e branding

- **Vecchio**: focus su testo (`.hero-title`, `.hero-subtitle`)
- **Nuovo**: focus su logo (`.hero-logo` largo 600px)

**Impatto**: cambio identità visiva della home (da tipografica a visual/logo-centric).

---

### 4) Form e CTA

- **Vecchio**: `.form-box` con `gap: 10px`
- **Nuovo**: `.form-box` con `gap: 50px`

**Impatto**: input/button molto più distanziati, percezione più “larga” ma meno compatta.

---

### 5) Price ticker

- **Vecchio**: ticker più compatto
- **Nuovo**:
  - aggiunti `.ticker-item`, regole dedicate
  - `#price-ticker-content` con `gap: 200px`

**Impatto**: barra più ariosa, possibile maggiore spazio vuoto percepito durante lo scroll.

---

### 6) Blocchi risultati/statistiche

- Entrambe le versioni mantengono struttura `stats-grid`, `charts-row`, `chart-card`, ma:
  - nel nuovo alcune regole sono consolidate
  - alcune regole puntuali del vecchio su tabelle/dettagli sono ridotte o assenti

**Impatto**: base simile, ma differenze nei micro-allineamenti e nella leggibilità di dettagli avanzati.

---

### 7) Fleet list / breakdown (differenza critica)

- **Vecchio**:
  - `.fleet-header` definito direttamente come grid
  - set completo di regole per `fleet-details`, righe dettaglio, tabelle crafting, stati expanded
- **Nuovo** (nel file confrontato inizialmente):
  - compariva `.fleet-header .fleet-ops` come grid (non equivalente)
  - compariva `.fleet-pct .fleet-header` (selettore anomalo/invertito)
  - diverse regole di dettaglio assenti/ridotte

**Impatto**: alta probabilità di regressione su header fleet, expand/collapse e allineamento colonne.

#### Dettaglio tecnico (target layout vecchio)

Per ottenere il comportamento del layout vecchio, i blocchi critici sono questi:

- ` .fleet-header `
  - `display: grid`
  - `grid-template-columns: 1fr auto auto auto`
  - `gap: 12px; padding: 8px 12px; align-items: center`

- ` .fleet-header .fleet-ops `
  - `font-size: 10px`
  - `min-width: 60px`
  - `text-align: right; color: #7a8ba0`

- ` .fleet-header .fleet-pct `
  - `min-width: 50px`
  - `text-align: right; color: #7a8ba0`

- ` .fleet-header .fleet-sol `
  - `min-width: 100px`
  - `text-align: right; color: #34d399`
  - `font-family: Roboto Mono`

- ` .fleet-details ` / stato expand
  - `display: none` di default
  - ` .fleet-item.expanded .fleet-details { display: block } `
  - ` .fleet-item.expanded ` con background/border evidenziati

- ` .fleet-ops-table ` (dettaglio riga)
  - versione vecchia: più compatta (`font-size: 10px`, `padding: 2px 4px`)
  - allineamenti colonna per leggibilità numerica (`td:nth-child(2..5)` a destra)

#### Segnali visivi per confermare che è “come il vecchio”

- Clic su fleet: dettaglio si apre/chiude, non resta sempre visibile.
- Header fleet resta su una sola riga con 4 aree: nome / ops / % / sol.
- Colonne numeriche nel dettaglio risultano allineate a destra e leggibili.
- Fleet espansa ha stato visivo distinto (background/border).

---

### 8) Dettagli crafting e tabelle avanzate

- **Vecchio**: forte copertura (`.crafting-details-table`, `.detail-table`, `.crafting-detail-*`)
- **Nuovo**: molte di queste regole non erano presenti nella bozza comparata

**Impatto**: perdita di chiarezza su dettagli operazione/crafting e gerarchie visive.

---

### 9) Start screen / stati iniziali

- **Vecchio**: includeva `.start-screen`, `.start-screen-active`, vari wrapper e comportamenti completi
- **Nuovo**: gestione più minimale

**Impatto**: onboarding più semplice ma meno “guidato” e meno controllato nei blocchi full-screen.

---

### 10) Mobile

- **Vecchio**: blocco `@media (max-width:768px)` molto esteso
- **Nuovo** (nel confronto iniziale): riduzione forte / assenza della copertura equivalente

**Impatto**: regressioni responsive probabili (da rivalutare separatamente, come richiesto).

## Elementi invariati o quasi invariati

- Palette principale dark (`#0b0e1a`, card `#13151f`, bordi `#1e222e`)
- Font stack base
- Pattern generale: cards, griglie statistiche, pie chart + legenda
- Tooltip cache e semantica colore fresh/stale (verde/rosso)

## Rischi regressione prioritari (ordine consigliato)

1. **Selettori fleet header** (`.fleet-header`, `.fleet-ops`, `.fleet-pct`)  
2. **Sidebar positioning** (`position: fixed`)  
3. **Regole dettaglio/crafting mancanti**  
4. **Allineamenti tabella breakdown**  
5. **Compattezza form/ticker (solo tuning visivo)**

## Checklist di verifica visiva consigliata

- Home: hero/logo, pulsanti start, privacy link, ticker
- Result page: sidebar fissa, profile/cache tooltip
- Fleet breakdown: allineamento 5 colonne + expand/collapse
- Operation summary: coerenza colori/valori USD
- Crafting details: header, colonne, leggibilità multi-riga

---

Se vuoi, nel prossimo step posso aggiungere una **matrice selector-by-selector** (vecchio → nuovo) con stato: `mantenuto / modificato / rimosso` per avere una diff ancora più operativa.