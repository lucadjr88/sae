import { TILE_W, TILE_H } from '../config.js';

// Rotazione della vista in quarti di giro attorno al centro della mappa (0..3).
let quarter = 0;

export const getRotation = () => quarter;
export const setRotation = q => { quarter = ((q % 4) + 4) % 4; };

function rotate(x, y) {
  switch (quarter) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
}

function unrotate(x, y) {
  switch (quarter) {
    case 1: return [y, -x];
    case 2: return [-x, -y];
    case 3: return [-y, x];
    default: return [x, y];
  }
}

// Sector (x verso est, y verso nord) -> schermo isometrico.
export function sectorToScreen(x, y) {
  const [rx, ry] = rotate(x, y);
  const col = rx;
  const row = -ry;
  return { x: (col - row) * (TILE_W / 2), y: (col + row) * (TILE_H / 2) };
}

export function screenToSector(sx, sy) {
  const a = (2 * sx) / TILE_W;
  const b = (2 * sy) / TILE_H;
  const [x, y] = unrotate((a + b) / 2, -((b - a) / 2));
  return { x, y };
}

// Vero se uno spostamento in settori va verso sinistra sullo schermo.
export function movesLeft(dx, dy) {
  return sectorToScreen(dx, dy).x < 0;
}
