// Asse della prua nello sprite, in coordinate schermo.
const AXIS = Math.atan(30 / 58);

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Rotazione (rad, oraria) necessaria per allineare la prua alla direzione `v` sullo schermo.
export function shipTilt(v) {
  const axis = v.x < 0 ? Math.PI - AXIS : AXIS;
  const rotation = wrap(Math.atan2(v.y, v.x) - axis);
  return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation));
}
