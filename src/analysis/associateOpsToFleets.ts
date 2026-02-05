// Associa SAGE ops decodificate alle fleet accounts
// Input: decodedOps (array), fleets (array)
// Output: { fleetBreakdown: [], playerOps: [] }

export function associateOpsToFleets(decodedOps: any[], fleets: any[]) {
  const fleetKeys = new Set(fleets.map(f => f.key));
  const cargoKeys = new Set(fleets.map(f => f.cargoKey).filter(Boolean));
  const ammoKeys = new Set(fleets.map(f => f.ammoKey).filter(Boolean));
  const fuelKeys = new Set(fleets.map(f => f.fuelKey).filter(Boolean));
  const breakdown: any[] = [];
  const playerOps: any[] = [];
  for (const op of decodedOps) {
    // Cerca riferimenti fleetid/cargoid/ammoid/fuelid tra le accounts e nei campi decoded
    const accounts = (op.accounts || []).map((a: any) => (typeof a === 'string' ? a : a.key || a.pubkey || ''));
    let matchType = null;
    let matchKey = null;
    if (accounts.some(acc => fleetKeys.has(acc))) {
      matchType = 'fleet';
      matchKey = accounts.find(acc => fleetKeys.has(acc));
    } else if (accounts.some(acc => cargoKeys.has(acc))) {
      matchType = 'cargo';
      matchKey = accounts.find(acc => cargoKeys.has(acc));
    } else if (accounts.some(acc => ammoKeys.has(acc))) {
      matchType = 'ammo';
      matchKey = accounts.find(acc => ammoKeys.has(acc));
    } else if (accounts.some(acc => fuelKeys.has(acc))) {
      matchType = 'fuel';
      matchKey = accounts.find(acc => fuelKeys.has(acc));
    }
    // Prova anche su campi decoded (fleetId, cargoId, ammoId, fuelId)
    if (!matchType && op.decoded) {
      const d = op.decoded;
      if (d.fleetId && fleetKeys.has(d.fleetId)) {
        matchType = 'fleet';
        matchKey = d.fleetId;
      } else if (d.cargoId && cargoKeys.has(d.cargoId)) {
        matchType = 'cargo';
        matchKey = d.cargoId;
      } else if (d.ammoId && ammoKeys.has(d.ammoId)) {
        matchType = 'ammo';
        matchKey = d.ammoId;
      } else if (d.fuelId && fuelKeys.has(d.fuelId)) {
        matchType = 'fuel';
        matchKey = d.fuelId;
      }
    }
    if (matchType) {
      breakdown.push({ ...op, fleetKey: matchKey, matchType });
    } else {
      playerOps.push(op);
    }
  }
  return { fleetBreakdown: breakdown, playerOps };
}
