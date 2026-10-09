import { sectorToScreen } from './iso.js';
import { isleFor } from './isleSprites.js';
import { makeLabel } from './labels.js';

// Larghezza dell'isola per tipo di starbase.
const ISLE_WIDTH = { css: 560, faction: 300, mrz: 190 };
const FACTION_COLORS = { MUD: '#ffb86b', ONI: '#ff7b9c', Ustur: '#7fd4ff' };
const ISLE_DEPTH = -1e5;

// Un'isola con etichetta per ogni starbase; sotto le navi (depth < y delle navi).
// Restituisce le etichette e `relayout()` da chiamare quando cambia la rotazione della vista.
export function drawStarbases(scene, starbases) {
  const items = starbases.map(sb => {
    const isle = scene.add.image(0, 0, isleFor(sb.sector)).setOrigin(0.5, 0.55);
    isle.setScale(ISLE_WIDTH[sb.kind] / isle.width);
    const label = makeLabel(scene, sb.name, { fontStyle: 'bold', color: FACTION_COLORS[sb.faction] ?? '#ffffff' }).setOrigin(0.5, 0);
    return { sb, isle, label };
  });

  const relayout = () => {
    for (const { sb, isle, label } of items) {
      const { x, y } = sectorToScreen(sb.sector[0], sb.sector[1]);
      isle.setPosition(x, y).setDepth(ISLE_DEPTH + y);
      label.setPosition(x, y + isle.displayHeight * 0.4).setDepth(ISLE_DEPTH + y + 1);
    }
  };
  relayout();
  return { labels: items.map(i => i.label), relayout };
}
