// Dimensione di un settore sullo schermo: più è grande, più isole e navi appaiono piccole rispetto alla mappa.
export const TILE_W = 232;
export const TILE_H = 120;

// Intervallo delle coordinate di settore mostrato dalla griglia.
export const SECTOR_RANGE = { min: -50, max: 50 };

export const SERVER = { wsPath: '/ws', retryMs: 3000 };

// Altezza del testo delle etichette a schermo, indipendente dallo zoom.
export const LABEL_PX = 14;
export const LABEL_FONT_PX = 56;

export const STALE_AFTER_MS = 90000;
