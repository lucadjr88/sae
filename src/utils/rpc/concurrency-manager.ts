// concurrency-manager.ts
// Gestisce limiti di concorrenza per endpoint RPC

interface ConcurrencyMeta {
  maxConcurrent: number;
  current: number;
}

const concurrencyMap: Record<string, ConcurrencyMeta> = {};

export function resetConcurrencyMap() {
  for (const key of Object.keys(concurrencyMap)) {
    delete concurrencyMap[key];
  }
}

export function canAcquire(url: string): boolean {
  const meta = concurrencyMap[url];
  if (!meta) return true;
  return meta.current < meta.maxConcurrent;
}

export function acquire(url: string, defaultMax: number = 2): boolean {
  if (!concurrencyMap[url]) concurrencyMap[url] = { maxConcurrent: defaultMax, current: 0 };
  if (concurrencyMap[url].current < concurrencyMap[url].maxConcurrent) {
    concurrencyMap[url].current++;
    return true;
  }
  return false;
}

export function release(url: string) {
  if (concurrencyMap[url] && concurrencyMap[url].current > 0) concurrencyMap[url].current--;
}

export function increaseMaxConcurrent(url: string) {
  if (!concurrencyMap[url]) concurrencyMap[url] = { maxConcurrent: 2, current: 0 };
  // cap max concurrency to avoid overwhelming a single endpoint
  if (concurrencyMap[url].maxConcurrent < 6) concurrencyMap[url].maxConcurrent++;
}

export function decreaseMaxConcurrent(url: string) {
  if (!concurrencyMap[url]) concurrencyMap[url] = { maxConcurrent: 2, current: 0 };
  if (concurrencyMap[url].maxConcurrent > 1) concurrencyMap[url].maxConcurrent--;
}

export function getConcurrencyMeta(url: string): ConcurrencyMeta | undefined {
  return concurrencyMap[url];
}
