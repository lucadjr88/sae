function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function computeDisplayedRentalTotal(fleet: {
  rental_start_time?: unknown;
  rental_end_time?: unknown;
  rate?: unknown;
}): string | null {
  const startTime = toFiniteNumber(fleet.rental_start_time);
  const endTime = toFiniteNumber(fleet.rental_end_time);
  const rate = toFiniteNumber(fleet.rate);

  if (startTime === null || endTime === null || rate === null) return null;

  const durationSeconds = endTime - startTime;
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return null;

  const durationDays = durationSeconds / (60 * 60 * 24);
  return (durationDays * rate).toFixed(2);
}
