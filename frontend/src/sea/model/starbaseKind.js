// Starbase della zona fazione (non MRZ): entro questo raggio, in settori, dalla propria CSS.
const FACTION_RADIUS = 11;

const isCss = sb => sb.level >= 6 || /CSS$/.test(sb.name);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Aggiunge `kind`: 'css' | 'faction' | 'mrz'.
export function classifyStarbases(starbases) {
  const csses = starbases.filter(isCss);
  return starbases.map(sb => {
    let kind = 'mrz';
    if (isCss(sb)) kind = 'css';
    else if (/^MRZ/.test(sb.name)) kind = 'mrz';
    else if (/^(MUD|UST|ONI)-\d/.test(sb.name)) kind = 'faction';
    else if (csses.some(c => c.faction === sb.faction && dist(c.sector, sb.sector) <= FACTION_RADIUS)) kind = 'faction';
    return { ...sb, kind };
  });
}
