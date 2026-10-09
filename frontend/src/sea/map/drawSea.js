import { SECTOR_RANGE, TILE_W, TILE_H } from '../config.js';
import { sectorToScreen } from './iso.js';

const LIGHT = [43, 149, 219];
const DARK = [10, 58, 99];
const DOWNSCALE = 12;
export const SEA_DARK_HEX = 0x0a3a63;

// Raggi, in settori dal centro: scuro fino a R_DARK, chiaro da R_LIGHT in poi.
const R_DARK = 12;
const R_LIGHT = 42;

const smoothstep = t => t * t * (3 - 2 * t);

// Sfondo marino a cerchi concentrici: scuro al centro e tra le MRZ, chiaro verso l'esterno (zone fazione).
export function drawSea(scene) {
  const lo = SECTOR_RANGE.min - 0.5;
  const hi = SECTOR_RANGE.max + 0.5;
  const left = sectorToScreen(lo, lo).x;
  const top = sectorToScreen(lo, hi).y;
  const w = Math.ceil(((hi - lo) * TILE_W) / DOWNSCALE);
  const h = Math.ceil(((hi - lo) * TILE_H) / DOWNSCALE);

  const tex = scene.textures.createCanvas('sea', w, h);
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const a = (2 * (left + px * DOWNSCALE)) / TILE_W;
      const b = (2 * (top + py * DOWNSCALE)) / TILE_H;
      const x = (a + b) / 2;
      const y = (a - b) / 2;
      const t = smoothstep(Math.min(1, Math.max(0, (Math.hypot(x, y) - R_DARK) / (R_LIGHT - R_DARK))));
      const i = (py * w + px) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = DARK[c] + (LIGHT[c] - DARK[c]) * t;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  scene.add.image(left, top, 'sea').setOrigin(0, 0).setScale(DOWNSCALE).setDepth(-2e6);
}
