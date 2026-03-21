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
  // Costruisci mappe di supporto per status
  const rentedMap = new Map(
    (rentedFleets || []).map(r => [r.fleet || r.pubkey, r])
  );
  // Flotte possedute che sono listed (messe in rent ma non affittate)
  const listedSet = new Set(
    (rentedFleets || [])
      .filter(r => r.isListed && r.owner_profile === profileId)
      .map(r => r.fleet || r.pubkey)
  );
  // Flotte possedute che sono loaned (affittate a terzi)
  const loanedSet = new Set(
    (rentedFleets || [])
      .filter(r => r.isRented && r.owner_profile === profileId && r.borrower && r.borrower !== profileId)
      .map(r => r.fleet || r.pubkey)
  );

  const normalizedFleets = (fleets || []).map(f => {
    const key = f.pubkey;
    let status = 'owned';
    if (loanedSet.has(key)) status = 'loaned';
    else if (listedSet.has(key)) status = 'listed';
    return {
      ...normalizeFleetForFrontend(f, loanedSet.has(key)),
      status
    };
  });

  // For rented-fleets aggiungi status borrowed/listed/loaned
  const normalizedRented = (rentedFleets || []).map(r => {
    const copy: any = { ...r };
    if (r.fleetData) copy.fleetData = normalizeFleetForFrontend(r.fleetData, true).data;
    // Determina status
    if (r.isListed && r.owner_profile === profileId) copy.status = 'listed';
    else if (r.isRented && r.owner_profile === profileId && r.borrower && r.borrower !== profileId) copy.status = 'loaned';
    else if (r.borrower === profileId) copy.status = 'borrowed';
    return copy;
  });

  await setCache('fleets', profileId, normalizedFleets, profileId);
  await setCache('rented-fleets', profileId, normalizedRented, profileId);
}

export default saveFleetsAndRented;
