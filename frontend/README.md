
# Frontend static


Questa cartella contiene una copia esatta del frontend, servita dal backend Node/Express direttamente sulla root `/`.

- Tutti i file statici sono accessibili da `/` (es: `/index.html`).
- Il backend e il frontend sono separati: nessun file frontend è mescolato con la logica API.
- Per modifiche, lavora qui e non nella vecchia repo.

Configurazione server:
- Vedi `src/backend/routes/frontend.ts` e `src/app.ts` per la logica di serving statico.
