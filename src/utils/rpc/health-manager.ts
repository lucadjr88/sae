// health-manager.ts
// Gestisce lo stato di health/backoff per endpoint RPC

interface HealthMeta {
  failures: number;
  successes: number;
  lastFailure: number;
  lastSuccess: number;
  backoffUntil: number;
}

const healthMap: Record<string, HealthMeta> = {};

export function resetHealthMap() {
  for (const key of Object.keys(healthMap)) {
    delete healthMap[key];
  }
}

export function recordFailure(url: string) {
  const now = Date.now();
  if (!healthMap[url]) healthMap[url] = { failures: 0, successes: 0, lastFailure: 0, lastSuccess: 0, backoffUntil: 0 };
  healthMap[url].failures++;
  healthMap[url].lastFailure = now;
  // Backoff esponenziale
  healthMap[url].backoffUntil = now + Math.min(60000, 1000 * Math.pow(2, healthMap[url].failures));
}

export function recordSuccess(url: string) {
  const now = Date.now();
  if (!healthMap[url]) healthMap[url] = { failures: 0, successes: 0, lastFailure: 0, lastSuccess: 0, backoffUntil: 0 };
  healthMap[url].successes++;
  healthMap[url].lastSuccess = now;
  healthMap[url].failures = 0;
  healthMap[url].backoffUntil = 0;
}

export function isHealthy(url: string) {
  const meta = healthMap[url];
  if (!meta) return true;
  return Date.now() > meta.backoffUntil;
}

export function isInBackoff(url: string) {
  const meta = healthMap[url];
  if (!meta) return false;
  return Date.now() < meta.backoffUntil;
}

export function getHealthMeta(url: string): HealthMeta | undefined {
  return healthMap[url];
}
