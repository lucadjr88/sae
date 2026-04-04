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
