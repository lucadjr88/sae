# Revisione analisi: serving asset frontend per app Android tramite backend


## Stato attuale (post-refactor)

## 1) Routing backend

- Express monta:
  - `/auth`
  - `/api` (endpoint dati)
  - `/` (static frontend + fallback SPA)
- `frontendRouter` usa:
  - produzione: `dist`
  - sviluppo: `frontend/src`

### Implicazione

In produzione il backend serve già asset e pagine da:

- `/assets/...`
- `/pages/...`

## 2) Build frontend e posizione asset

- Build: TypeScript backend + Vite frontend.
- Vite usa input multipli:
  - `frontend/index.html`
  - `frontend/pages/privacy_policy.html`
  - `frontend/pages/instructions.html`
- Output in `dist`:
  - `dist/index.html`
  - `dist/pages/*.html`
  - `dist/assets/*` (bundle e asset hashati)



## 3) Referenziazione asset lato frontend

- `privacyPolicyPage.ts` e `instructionsPage.ts` importano CSS/asset via TypeScript.
- Gli HTML in `dist/pages` vengono generati con riferimenti hashati coerenti.

## Gap e rischi aggiornati

1. ~~**Nessun namespace API dedicato agli asset**~~ ✅ **RISOLTO**
   - Implementato: `/api/assets/*` e `/api/pages/*` operativi.

2. **Dev/prod disallineati nel router frontend**
   - In dev il router punta a `frontend/src`, ma le entry HTML principali sono in `frontend/` e `frontend/pages/`.
   - Questo è un rischio funzionale per test locali backend-only.

3. ~~**Cache policy non esplicita per mobile**~~ ✅ **RISOLTO**
   - Asset hashati: `Cache-Control: public, max-age=31536000, immutable`
   - Pagine/manifest: `Cache-Control: no-cache`

4. ~~**Mancanza manifest ufficiale per client Android**~~ ✅ **RISOLTO**
   - Endpoint `/api/assets/manifest` attivo con discovery automatico asset.

5. **Rischio file stale in `dist/assets`**
   - `emptyOutDir: false` può lasciare artefatti di build precedenti se non si pulisce `dist`.

## Opzioni implementative (aggiornate)

## Opzione A — Stato attuale (solo route root)

### Descrizione

Android usa direttamente route esistenti (`/assets/...`, `/pages/...`).

### Pro

- Zero modifiche backend immediate.
- Compatibile con output build attuale.

### Contro

- Nessun contratto API esplicito.
- Cache/versioning non formalizzati.

## Opzione B — Alias API per asset (consigliata come baseline)

### Descrizione

Aggiungere alias backend:

- `GET /api/assets/*` → `dist/assets/*`
- `GET /api/pages/*` → `dist/pages/*`

(non serve più `/api/ui/styles/*` nel flusso nuovo)

### Pro

- Contratto stabile per Android.
- Nessun breaking change: si possono mantenere anche route root.

### Contro

- Duplica i path finché non si completa la migrazione client.

## Opzione C — Alias API + manifest versionato (raccomandata)

### Descrizione

Estendere l’opzione B con:

- `GET /api/assets/manifest`

con struttura tipo:

```json
{
  "buildId": "20260306-120000",
  "assets": {
    "privacyPage": "/api/pages/privacy_policy.html",
    "instructionsPage": "/api/pages/instructions.html",
    "logoStarAtlas": "/api/assets/staratlas-<hash>.png",
    "backgroundMain": "/api/assets/wp14018865-4k-earth-pc-wallpapers-<hash>.jpg"
  }
}
```

### Pro

- Disaccoppia Android dai nomi hashati.
- Semplifica invalidazione cache e rollout.

### Contro

- Richiede endpoint backend + logica di discovery file.

## ✅ Implementazione completata (Opzione C)

**Data:** 6 marzo 2026

L'Opzione C è stata implementata con successo. Il sistema ora espone:

### Endpoint attivi

- `GET /api/assets/*` → alias di `dist/assets/*`
- `GET /api/pages/*` → alias di `dist/pages/*`
- `GET /api/assets/manifest` → manifest JSON versionato

### Esempio manifest response

```json
{
  "buildId": "2026-03-06T15-49-02",
  "timestamp": 1772812142331,
  "assets": {
    "backgroundMain": "/api/assets/wp14018865-4k-earth-pc-wallpapers-BFfW_dx-.jpg",
    "logoStarAtlas": "/api/assets/staratlas-BHe_GgO4.png",
    "iconSeedvault": "/api/assets/seedvault2-BDxeTkcJ.png",
    "iconResources": "/api/assets/resources_icon-C4FqQydx.png",
    "iconTax": "/api/assets/tax_icon-C-we5T_l.png",
    "imageInstruction1": "/api/assets/istruzione1-DHiObIwQ.png",
    "imageInstruction2": "/api/assets/istruzione2-stGGoj4W.png",
    "privacyPage": "/api/pages/privacy_policy.html",
    "instructionsPage": "/api/pages/instructions.html"
  }
}
```

### Cache policy implementate

- **Asset hashati:** `Cache-Control: public, max-age=31536000, immutable`
- **Pagine HTML:** `Cache-Control: no-cache`
- **Manifest:** `Cache-Control: no-cache`, `Content-Type: application/json`

### Backward compatibility

Le route root legacy (`/assets/*`, `/pages/*`) continuano a funzionare per compatibilità con la web app esistente.

### File modificati/creati

- `src/backend/routes/assets.ts` (nuovo)
- `src/app.ts` (aggiornato per montare il nuovo router)

## Raccomandazione aggiornata

~~Sequenza suggerita:~~ **Implementazione completata:**

1. ~~**Allineamento dev/prod**~~ **(Pending)** - Il `frontendRouter` dev/prod presenta ancora disallineamento da risolvere.
2. ~~**Alias API asset/pages**~~ ✅ **COMPLETATO** - Route `/api/assets` e `/api/pages` operative.
3. ~~**Manifest versionato**~~ ✅ **COMPLETATO** - Endpoint `/api/assets/manifest` con cache policy implementate.
4. ~~**Audit hardcoded periodico**~~ ✅ **IN CORSO** - Fallback wallet icon sanato, audit su altri componenti in corso.

## Note architetturali

- Gli alias statici su `/api/...` vanno montati prima del fallback SPA.
- È opportuno mantenere backward compatibility dei path root finché web e Android non convergono.
- Se utile, aggiungere endpoint `GET /api/assets/version` per observability lato mobile.

## Riferimenti verificati in questa revisione

- `src/app.ts`
- `src/backend/routes/frontend.ts`
- `src/backend/routes/assets.ts` ⭐ (nuovo)
- `frontend/vite.config.ts`
- `frontend/pages/privacy_policy.html`
- `frontend/pages/instructions.html`
- `frontend/src/pages/privacyPolicyPage.ts`
- `frontend/src/pages/instructionsPage.ts`
- `frontend/src/ui/elements/privacyPolicy.ts`
- `frontend/src/hompage.ts`

## Conclusione

Il refactor ha migliorato nettamente la robustezza del frontend (meno hardcoded, build più pulita, pagine allineate al TS). 

**L'Opzione C è stata implementata con successo** e il backend ora espone un contratto API stabile per l'app Android:
- Namespace dedicato `/api/assets` e `/api/pages`
- Manifest versionato con discovery automatico
- Cache policy ottimizzate per mobile (immutable per asset hashati, no-cache per pagine/manifest)
- Backward compatibility mantenuta per la web app

**Prossimi step raccomandati:**
1. Allineare il comportamento dev/prod del `frontendRouter`
2. Integrare le nuove API nell'app Android
3. Eventualmente deprecare le route root legacy dopo migrazione client completa