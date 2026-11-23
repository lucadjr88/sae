export function processAnalysisData(data: any) {
  const fleets = (data.fleets || []).map((f: any) => ({
    ...f,
    isListed: typeof f.isListed === 'boolean' ? f.isListed : false,
    isLoaned: typeof f.isLoaned === 'boolean' ? f.isLoaned : false,
    isRented: typeof f.isRented === 'boolean' ? f.isRented : false
  }));
  const walletPubkey = data.walletAuthority || data.feePayer || null;
  const fleetNames: { [account: string]: string } = {};
  const fleetIsRented: { [account: string]: boolean } = {};
  const fleetStatus: { [account: string]: 'owned' | 'listed' | 'borrowed' | 'rented' } = {};
  const rentedFleetKeys = new Set();
  if (Array.isArray(data.rentedFleets)) {
    data.rentedFleets.forEach(f => {
      if (typeof f === 'string') {
        rentedFleetKeys.add(f.trim());
      } else if (f && typeof f === 'object') {
        if (f.fleet) rentedFleetKeys.add(String(f.fleet).trim());
        if (f.fleet_ships) rentedFleetKeys.add(String(f.fleet_ships).trim());
        if (f.fleet_label) rentedFleetKeys.add(String(f.fleet_label).trim());
        if (f.callsign) rentedFleetKeys.add(String(f.callsign).trim());
      }
    });
  }
  fleets.forEach((f: any) => {
    if (f && f.data) {
      const callsign = f.callsign?.trim();
      const key = f.key?.trim();
      const fleetShips = f.data.fleetShips?.trim();
      const reason: string[] = [];
      if (f.isRented || rentedFleetKeys.has(callsign) || rentedFleetKeys.has(key) || rentedFleetKeys.has(fleetShips)) {
        f.isRented = true;
        reason.push('isRented:true');
        console.log('trovata rented fleet:', { callsign, key, fleetShips, reason });
      }
      if (f.data.fleetShips) {
        fleetNames[f.data.fleetShips] = f.callsign;
        fleetIsRented[f.data.fleetShips] = f.isRented;
        fleetStatus[f.data.fleetShips] = f.isRented ? 'borrowed' : 'owned';
      }
      fleetNames[f.key] = f.callsign;
      fleetIsRented[f.key] = f.isRented;
      fleetStatus[f.key] = f.isRented ? 'borrowed' : 'owned';
      if (f.data.fuelTank) {
        fleetNames[f.data.fuelTank] = f.callsign;
        fleetIsRented[f.data.fuelTank] = f.isRented;
        fleetStatus[f.data.fuelTank] = f.isRented ? 'borrowed' : 'owned';
      }
      if (f.data.ammoBank) {
        fleetNames[f.data.ammoBank] = f.callsign;
        fleetIsRented[f.data.ammoBank] = f.isRented;
        fleetStatus[f.data.ammoBank] = f.isRented ? 'borrowed' : 'owned';
      }
      if (f.data.cargoHold) {
        fleetNames[f.data.cargoHold] = f.callsign;
        fleetIsRented[f.data.cargoHold] = f.isRented;
        fleetStatus[f.data.cargoHold] = f.isRented ? 'borrowed' : 'owned';
      }
    }
  });

  if (Array.isArray(data.rentedFleets)) {
    data.rentedFleets.forEach(f => {
      if (f && typeof f === 'object') {
        const key = (f.pubkey || f.fleet || '').trim();
        const label = (f.fleet_label || f.callsign || '').trim();
        const owner = f.owner_profile || '';
        if (key && label && !fleetNames[key]) {
          fleetNames[key] = label;
          fleetIsRented[key] = true;
        }
        if (key && owner && owner === data.profileId) {
          if (typeof f.active === 'boolean' && f.active) {
            fleetStatus[key] = 'borrowed';
          } else {
            fleetStatus[key] = 'listed';
          }
        } else if (key && owner && owner !== data.profileId) {
          fleetStatus[key] = 'borrowed';
        } else if (key && !fleetStatus[key]) {
          fleetStatus[key] = 'rented';
        }
      }
    });
  }

  return { fleets, walletPubkey, fleetNames, fleetIsRented, fleetStatus };
}
