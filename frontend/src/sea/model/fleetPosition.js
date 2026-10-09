// Posizione in coordinate di settore (float) di una flotta all'istante `now` (ms).
// Restituisce null se lo snapshot non contiene una posizione.
export function fleetPosition(fleet, now) {
  if (fleet.sector && fleet.state !== 'MoveWarp' && fleet.state !== 'MoveSubwarp') {
    return { x: fleet.sector[0], y: fleet.sector[1], heading: null, progress: null };
  }
  if ((fleet.state === 'MoveWarp' || fleet.state === 'MoveSubwarp') && fleet.from && fleet.to) {
    const span = fleet.arrival - fleet.departure;
    const t = span > 0 ? Math.min(1, Math.max(0, (now - fleet.departure) / span)) : 1;
    const [x0, y0] = fleet.from;
    const [x1, y1] = fleet.to;
    return {
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      heading: x1 === x0 && y1 === y0 ? null : [x1 - x0, y1 - y0],
      progress: t,
    };
  }
  return null;
}
