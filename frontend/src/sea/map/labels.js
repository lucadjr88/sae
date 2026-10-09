import { LABEL_PX, LABEL_FONT_PX } from '../config.js';

// Testo disegnato grande e ridotto in scala: resta nitido e di dimensione costante a schermo.
export function makeLabel(scene, text, style = {}) {
  const t = scene.add.text(0, 0, text, {
    fontSize: `${LABEL_FONT_PX}px`,
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: Math.round(LABEL_FONT_PX / 6),
    ...style,
  });
  return t;
}

export function scaleLabels(labels, zoom) {
  const s = LABEL_PX / LABEL_FONT_PX / zoom;
  for (const l of labels) l.setScale(s);
}
