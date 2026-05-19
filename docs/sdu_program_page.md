# Bozza implementazione pagina sduProgram

## Obiettivo

Introdurre una nuova sezione frontend chiamata sduProgram, inizialmente vuota, accessibile dalla UI risultati.

In questa fase vogliamo:

1. Valutare inserimento icona dedicata in sidebar.
2. Valutare integrazione nello switch verticale già esistente.
3. Definire la soluzione minima per arrivare a una sezione SDU navigabile anche senza contenuti.

## Stato attuale frontend (punti rilevanti)

- Sidebar costruita in frontend/src/ui/elements/sideBar.ts.
- Switch sezione costruito in frontend/src/ui/elements/toggleSwitch.ts.
- Lo switch gestisce oggi 3 viste: fee, resource, rental.
- I risultati vengono montati nel contenitore result-container (creato da frontend/src/resultpage.ts).
- La logica di bootstrap dei payload e del toggle passa da frontend/src/services/api.ts (analyzeFees + initializeToggleSwitch).

## Requisito funzionale minimo

Quando l'utente seleziona SDU deve vedere una vista placeholder, ad esempio:

- titolo: SDU Program
- testo: Sezione in preparazione

Nessuna chiamata backend aggiuntiva in questa fase.

## Opzione A - SDU come 4a voce nello switch verticale (consigliata)

Descrizione:

- Estendere ToggleView con valore sdu.
- Aggiungere quarto input radio e quarta icona nel markup toggleSwitchHTML.
- Aggiungere cache view SDU in parallelo a fee/resource/rental.
- Aggiornare showCachedView con branch esplicito per sdu.
- Inserire una funzione di creazione placeholder SDU e salvarla in cache alla prima analisi.

Pro:

- UX coerente con il paradigma esistente (selettore verticale per le sezioni).
- Delta minimo sul codice attuale del routing vista.
- Nessun nuovo pattern di navigazione da imparare.

Contro:

- Necessario ritoccare CSS del toggle da 3 a 4 slot (altezze/translate).

Impatto file atteso:

- frontend/src/ui/elements/toggleSwitch.ts
- frontend/src/ui/styles/toggleSwitch.css
- frontend/src/services/api.ts
- nuovo file consigliato: frontend/src/ui/elements/sdu_program_playload.ts

## Opzione B - Icona dedicata in sidebar fuori dallo switch

Descrizione:

- Inserire nuova icona in sidebar (vicino a profile/playstore o nella fascia centrale).
- Al click, sostituire result-container con placeholder SDU.

Pro:

- Non richiede espansione del toggle.

Contro:

- Introduce un secondo meccanismo di navigazione sezione.
- Rischio UX incoerente: alcune sezioni nello switch, una in sidebar.
- Richiede più attenzione a stati attivi/sincronizzazione con toggle esistente.

Impatto file atteso:

- frontend/src/ui/elements/sideBar.ts
- frontend/src/ui/styles/sideBar.css
- frontend/src/ui/elements/toggleSwitch.ts (per sincronizzare stato attivo, se necessario)

## Decisione proposta per fase 1

Adottare Opzione A:

- SDU come 4a sezione nello switch verticale.
- Placeholder statico senza dipendenze backend.
- Eventuale icona sidebar rinviata alla fase 2 solo se emerge un bisogno UX specifico.

Motivo:

Minimizza complessità e mantiene una sola grammatica di navigazione.

## Specifica tecnica minima (fase 1)

### 1) Nuovo payload UI SDU

Creare elemento UI dedicato con factory semplice:

- export function createSduProgramPlaceholder(): HTMLElement

Contenuto minimo:

- container id: sduProgramResults
- heading: SDU Program
- testo informativo in preparazione

### 2) Estensione toggleSwitch.ts

- Tipo: fee | resource | rental | sdu
- Nuovo radio: opt-sdu
- Nuova label icona SDU
- Nuova cache: cachedSduView
- Nuovi setter/getter coerenti con pattern esistente
- showCachedView deve supportare sdu

### 3) Aggiornamento CSS toggle a 4 stati

Da ricalibrare:

- altezza vertical-selector
- altezza slot selector-item
- translateY per resource, rental, sdu
- equivalenti media query mobile

### 4) Hook in analyzeFees

Dopo displayFeeResults/displayResourceResults/rentalState_playload:

- costruire (o valorizzare una sola volta) view SDU placeholder
- salvarla nel cache layer del toggle

Questo garantisce che il click su SDU funzioni subito dopo la prima analisi.

## Criteri di accettazione

1. Presenza icona SDU nello switch verticale.
2. Click su SDU mostra vista placeholder nel result-container.
3. Nessun errore JS se la vista SDU non ha dati.
4. Le viste fee/resource/rental continuano a funzionare come prima.
5. Preferenza vista attiva SDU mantenuta dal meccanismo già usato da activeViewPreference.

## Note per fase 2 (facoltativa)

- Valutare icona SDU in sidebar solo se richiesta esplicita di shortcut rapido.
- Se introdotta, deve chiamare lo stesso meccanismo del toggle (single source of truth della vista attiva), evitando logiche duplicate.
