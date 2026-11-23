function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

// For the optimistic cache update, the contract seed rate is the source of truth.
// Some decoded rental-state accounts surface `0`, so we only use that value as fallback.
export function pickOptimisticRentalRate(seedRate: unknown, confirmedRate: unknown): number | null {
  const normalizedSeedRate = toFiniteNumber(seedRate);
  if (normalizedSeedRate !== null) return normalizedSeedRate;
  return toFiniteNumber(confirmedRate);
}

export function matchesFleetByTxMeta(fleet: any, txMeta: any): boolean {
  const sameFleet = typeof txMeta?.fleet_id === 'string' && (
    fleet?.fleet_id === txMeta.fleet_id
    || fleet?.fleet === txMeta.fleet_id
    || fleet?.pubkey === txMeta.fleet_id
    || fleet?.key === txMeta.fleet_id
    || fleet?.data?.fleetShips === txMeta.fleet_id
  );
  const sameContract = typeof txMeta?.contract === 'string' && (
    fleet?.contractPubkey === txMeta.contract
    || fleet?.contract === txMeta.contract
    || fleet?.address === txMeta.contract
  );
  const sameRentalState = typeof txMeta?.rentalState === 'string' && (
    fleet?.rental_state_pubkey === txMeta.rentalState
    || fleet?.current_rental_state === txMeta.rentalState
    || fleet?.rentalState === txMeta.rentalState
  );
  return sameFleet || sameContract || sameRentalState;
}

export function buildListedFleetPreview(currentData: any, txMeta: any): any {
  const fleets = Array.isArray(currentData?.fleets) ? currentData.fleets : [];
  const sourceFleet = fleets.find((fleet: any) => matchesFleetByTxMeta(fleet, txMeta)) ?? null;
  const fleetId = sourceFleet?.key || sourceFleet?.pubkey || sourceFleet?.fleet || txMeta?.fleet_id || null;
  const fleetLabel = sourceFleet?.callsign || sourceFleet?.fleet_label || sourceFleet?.fleet_name || txMeta?.fleet_label || fleetId || 'Unknown';
  const rateRaw = txMeta?.rate ?? sourceFleet?.rate ?? null;
  const parsedRate = rateRaw === null || rateRaw === undefined || rateRaw === '' ? null : Number(rateRaw);
  const durationMinRaw = txMeta?.durationMin ?? sourceFleet?.duration_min ?? 1;
  const durationMaxRaw = txMeta?.durationMax ?? sourceFleet?.duration_max ?? 24;

  return {
    ...(sourceFleet && typeof sourceFleet === 'object' ? sourceFleet : {}),
    fleet: fleetId,
    fleet_id: fleetId,
    key: sourceFleet?.key ?? fleetId,
    pubkey: fleetId,
    fleet_label: fleetLabel,
    callsign: sourceFleet?.callsign ?? fleetLabel,
    isListed: true,
    isLoaned: false,
    isRented: false,
    contractPubkey: typeof txMeta?.contract === 'string' ? txMeta.contract : sourceFleet?.contractPubkey ?? null,
    contract: typeof txMeta?.contract === 'string' ? txMeta.contract : sourceFleet?.contract ?? null,
    address: typeof txMeta?.contract === 'string' ? txMeta.contract : sourceFleet?.address ?? null,
    owner_profile: typeof txMeta?.ownerProfile === 'string' ? txMeta.ownerProfile : sourceFleet?.owner_profile ?? null,
    current_rental_state: null,
    rental_state_pubkey: null,
    rate: Number.isFinite(parsedRate as number) ? parsedRate : rateRaw,
    duration_min: Number(durationMinRaw) || 1,
    duration_max: Number(durationMaxRaw) || 24,
    payment_frequency: typeof txMeta?.paymentFrequency === 'string'
      ? String(txMeta.paymentFrequency).replace(/^@/, '')
      : sourceFleet?.payment_frequency ?? 'daily',
    rental_start_time: null,
    rental_end_time: null,
    rental_cancelled: false,
  };
}
