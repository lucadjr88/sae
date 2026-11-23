// health-manager.ts
// Gestisce lo stato di health/backoff per endpoint RPC

interface HealthMeta {
  failures: number;
  successes: number;
  lastFailure: number;
  lastSuccess: number;
  backoffUntil: number;
  score: number;
}

const healthMap: Record<string, HealthMeta> = {};
const forbiddenUntil: Record<string, number> = {};

export function resetHealthMap(preserveForbidden = false) {
  for (const key of Object.keys(healthMap)) {
    delete healthMap[key];
  }
  if (!preserveForbidden) {
    for (const key of Object.keys(forbiddenUntil)) {
      delete forbiddenUntil[key];
    }
  }
}

export function recordForbidden(url: string, durationMs = 60000) {
  forbiddenUntil[url] = Math.max(forbiddenUntil[url] || 0, Date.now() + durationMs);
}

export function isForbidden(url: string) {
  const until = forbiddenUntil[url];
  if (!until) return false;
  if (Date.now() < until) return true;
  delete forbiddenUntil[url];
  return false;
}

export function recordFailure(url: string) {
  const now = Date.now();
  if (!healthMap[url]) {
    healthMap[url] = { failures: 0, successes: 0, lastFailure: 0, lastSuccess: 0, backoffUntil: 0, score: 100 };
  }
  healthMap[url].failures++;
  healthMap[url].lastFailure = now;
  healthMap[url].score = Math.max(0, healthMap[url].score - 15);
  // Backoff esponenziale
  healthMap[url].backoffUntil = Math.max(healthMap[url].backoffUntil, now + Math.min(60000, 1000 * Math.pow(2, healthMap[url].failures)));
}

export function recordSuccess(url: string) {
  const now = Date.now();
  if (!healthMap[url]) {
    healthMap[url] = { failures: 0, successes: 0, lastFailure: 0, lastSuccess: 0, backoffUntil: 0, score: 100 };
  }
  healthMap[url].successes++;
  healthMap[url].lastSuccess = now;
  healthMap[url].failures = 0;
  if (healthMap[url].backoffUntil <= now) healthMap[url].backoffUntil = 0;
  healthMap[url].score = Math.min(1000, healthMap[url].score + 10);
}

export function getScore(url: string): number {
  return healthMap[url]?.score ?? 100;
}

export function isHealthy(url: string) {
  const meta = healthMap[url];
  return !isForbidden(url) && (!meta || Date.now() > meta.backoffUntil);
}

export function isInBackoff(url: string) {
  const meta = healthMap[url];
  return isForbidden(url) || (!!meta && Date.now() < meta.backoffUntil);
}

export function getHealthMeta(url: string): HealthMeta | undefined {
  return healthMap[url];
}
