// public/js/cache/fleet-processor.js

export function buildFleetAccountsMap(fleets) {
  const allAccounts = [];
  const names = {};
  const rentalStatus = {};

  fleets.forEach(f => {
    const accounts = [
      f.data.fleetShips,
      f.key,
      f.data.fuelTank,
      f.data.ammoBank,
      f.data.cargoHold
    ].filter(Boolean);

    allAccounts.push(...accounts);
    
    const isRented = !!f.isRented;
    accounts.forEach(acc => {
      names[acc] = f.callsign;
      rentalStatus[acc] = isRented;
    });
  });

  return {
    accounts: [...new Set(allAccounts)],
    names,
    rentalStatus
  };
}

export function buildRentedFleetNames(fleets, rentalStatus) {
  const rentedNames = new Set();
  
  try {
    fleets.forEach(f => {
      const isRented = !!(rentalStatus[f.key] || rentalStatus[f.data.fleetShips]);
      if (isRented) rentedNames.add(f.callsign);
    });
  } catch (err) {
    console.warn('[fleet-processor] Could not build rented fleet names:', err);
  }
  
  return rentedNames;
}