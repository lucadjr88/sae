import { setCache } from '../utils/cache';

function normalizeFleetForFrontend(fleet: any, isRented = false) {
  return {
    key: fleet.pubkey || fleet.pubkey || fleet.pubkey?.toString?.(),
    callsign: fleet.fleet_label || fleet.callsign || null,
    isRented: !!isRented,
    data: {
      fleetShips: fleet.fleet_ships || fleet.fleetShips || null,
      fuelTank: fleet.fuel_tank || fleet.fuelTank || null,
      ammoBank: fleet.ammo_bank || fleet.ammoBank || null,
      cargoHold: fleet.cargo_hold || fleet.cargoHold || null,
      stats: fleet.stats || null,
      pubkey: fleet.pubkey || null,
      updateId: fleet.update_id || fleet.updateId || null,
      bump: fleet.bump || null,
      raw: fleet.raw || null,
      decodedInstructions: fleet.decodedInstructions || fleet.decoded_instructions || []
    }
  };
}

export async function saveFleetsAndRented(profileId: string, fleets: any[], rentedFleets: any[]) {
  // Normalize fleets array into the shape expected by the frontend
  const rentedSet = new Set<string>((rentedFleets || []).map(r => r.fleet || r.pubkey || (r.fleetData && r.fleetData.pubkey)).filter(Boolean));
  const normalizedFleets = (fleets || []).map(f => normalizeFleetForFrontend(f, rentedSet.has(f.pubkey)));

  // For rented-fleets we keep original object but include normalized fleetData when present
  const normalizedRented = (rentedFleets || []).map(r => {
    const copy: any = { ...r };
    if (r.fleetData) copy.fleetData = normalizeFleetForFrontend(r.fleetData, true).data;
    return copy;
  });

  await setCache('fleets', profileId, normalizedFleets, profileId);
  await setCache('rented-fleets', profileId, normalizedRented, profileId);
}

export default saveFleetsAndRented;
