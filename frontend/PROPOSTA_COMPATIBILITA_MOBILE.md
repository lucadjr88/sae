# Proposta di Patch Modulare per Compatibilità Mobile

Questa proposta descrive come aggiungere la compatibilità mobile al progetto in modo modulare e minimale, senza modificare direttamente il codice esistente, ma aggiungendo solo i file e le logiche necessarie.

## Obiettivi
- Aggiungere supporto mobile (responsive design e logica JS/TS di adattamento GUI mobile se necessario)
- Minimizzare le modifiche ai file esistenti
- Centralizzare la logica mobile in file separati

---

## 1. Stili Responsive Modulari

**Azione:**
- Creare un nuovo file: `src/styles/mobile.css`
- Inserire qui tutte le media queries e gli stili specifici per mobile.
- Importare questo file solo in `main.ts` o nel punto di ingresso principale.

**Esempio di `src/styles/mobile.css`:**
```css
@media (max-width: 768px) {
  body {
    font-size: 16px;
    padding: 0 8px;
  }
  .sidebar {
    display: none;
  }
  .main-content {
    width: 100%;
    padding: 0;
  }
  /* Altri stili specifici per mobile... */
}
```

**Importazione in `main.ts`:**
```ts
import './styles/mobile.css';
```

---

## 2. Logica JS/TS per Mobile (opzionale)

**Azione:**
- Creare un nuovo file: `src/utils/mobile.ts`
- Inserire qui funzioni di utilità per rilevare il mobile e gestire eventuali comportamenti specifici (es. menu hamburger, swipe, ecc.).
- Importare e usare queste funzioni solo dove necessario.

**Esempio di `src/utils/mobile.ts`:**
```ts
export function isMobile() {
  return window.innerWidth <= 768;
}

export function onMobile(callback: () => void) {
  if (isMobile()) callback();
}
```

**Utilizzo (ad esempio in `main.ts`):**
```ts
import { onMobile } from './utils/mobile';

onMobile(() => {
  // Logica opzionale per mobile
});
```

---

## 3. Modifiche Minime ai File Esistenti

- Non è necessario modificare i componenti o i file esistenti.
- Basta importare i nuovi file CSS e TS nel punto di ingresso principale (`main.ts`).
- Eventuali comportamenti mobile possono essere aggiunti solo tramite i nuovi moduli.

---

## 4. Vantaggi di Questo Approccio
- Separazione netta tra logica/stili mobile e codice esistente
- Facilità di manutenzione e rollback
- Possibilità di estendere la logica mobile senza impattare il resto del progetto

---

## 5. Prossimi Passi
1. Creare `src/styles/mobile.css` e aggiungere le media queries necessarie.
2. Creare `src/utils/mobile.ts` per la logica JS/TS opzionale.
3. Importare entrambi in `main.ts`.
4. Testare su dispositivi mobili e adattare gli stili/comportamenti secondo necessità.

---

Questa soluzione garantisce modularità e minima invasività, facilitando l'aggiunta della compatibilità mobile senza refactoring del codice esistente.