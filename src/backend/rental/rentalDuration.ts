export const DURATION_SECONDS_BY_UNIT: Record<string, number> = {
  decasecond: 10,
  minute: 60,
  hourly: 3600,
  hour: 3600,
  daily: 86400,
  day: 86400,
  weekly: 604800,
  week: 604800,
  monthly: 2592000,
  month: 2592000,
};

export function normalizeDurationUnit(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'decaseconds') return 'decasecond';
  if (normalized.startsWith('min')) return 'minute';
  if (normalized.startsWith('hour')) return 'hourly';
  if (normalized.startsWith('day')) return 'daily';
  if (normalized.startsWith('week')) return 'weekly';
  if (normalized.startsWith('month')) return 'monthly';
  return normalized;
}

export function convertDurationToContractUnits(duration: number, requestedUnit: unknown, paymentFrequency: unknown): number {
  const sourceUnit = normalizeDurationUnit(requestedUnit || 'day');
  const targetUnit = normalizeDurationUnit(paymentFrequency);
  const sourceSeconds = DURATION_SECONDS_BY_UNIT[sourceUnit];
  const targetSeconds = DURATION_SECONDS_BY_UNIT[targetUnit];

  if (!sourceSeconds) {
    throw new Error(`Unsupported duration unit: ${requestedUnit}`);
  }
  if (!targetSeconds) {
    return duration;
  }
  const convertedDuration = (duration * sourceSeconds) / targetSeconds;
  if (!Number.isInteger(convertedDuration) || convertedDuration <= 0) {
    throw new Error(`Duration ${duration} ${sourceUnit} is not compatible with payment frequency ${paymentFrequency}`);
  }
  return convertedDuration;
}
