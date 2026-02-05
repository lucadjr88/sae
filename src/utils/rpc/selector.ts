// selector.ts
// Seleziona endpoint dal pool (round robin, health-aware, pluggable)
import { isHealthy } from './health-manager';

let lastIndex = 0;

export function pickNext(pool: any[]): any {
  const healthy = pool.filter(ep => isHealthy(ep.url));
  if (healthy.length === 0) return pool[lastIndex++ % pool.length];
  lastIndex = (lastIndex + 1) % healthy.length;
  return healthy[lastIndex];
}
