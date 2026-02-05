// metrics.ts
// Traccia metriche base per endpoint RPC

interface MetricsMeta {
  latencies: number[];
  processed: number;
  errors: number;
  statusCounts: Record<number, number[]>; // map statusCode -> timestamps
}

const metricsMap: Record<string, MetricsMeta> = {};

export function resetMetricsMap() {
  for (const key of Object.keys(metricsMap)) {
    delete metricsMap[key];
  }
}

export function recordLatency(url: string, ms: number) {
  if (!metricsMap[url]) metricsMap[url] = { latencies: [], processed: 0, errors: 0, statusCounts: {} } as MetricsMeta;
  metricsMap[url].latencies.push(ms);
  if (metricsMap[url].latencies.length > 100) metricsMap[url].latencies.shift();
}

export function getLatency(url: string): number {
  const meta = metricsMap[url];
  if (!meta || meta.latencies.length === 0) return 0;
  return meta.latencies.reduce((a, b) => a + b, 0) / meta.latencies.length;
}

export function recordProcessed(url: string) {
  if (!metricsMap[url]) metricsMap[url] = { latencies: [], processed: 0, errors: 0, statusCounts: {} } as MetricsMeta;
  metricsMap[url].processed++;
}

export function recordError(url: string) {
  if (!metricsMap[url]) metricsMap[url] = { latencies: [], processed: 0, errors: 0, statusCounts: {} } as MetricsMeta;
  metricsMap[url].errors++;
}

export function recordStatusCode(url: string, statusCode: number) {
  if (!metricsMap[url]) metricsMap[url] = { latencies: [], processed: 0, errors: 0, statusCounts: {} } as MetricsMeta;
  if (!metricsMap[url].statusCounts) metricsMap[url].statusCounts = {};
  if (!metricsMap[url].statusCounts![statusCode]) metricsMap[url].statusCounts![statusCode] = [];
  metricsMap[url].statusCounts![statusCode].push(Date.now());
  // keep window recent entries (e.g., last 100)
  if (metricsMap[url].statusCounts![statusCode].length > 500) metricsMap[url].statusCounts![statusCode].shift();
}

export function countStatusInWindow(url: string, statusCode: number, windowMs: number): number {
  const meta = metricsMap[url];
  if (!meta || !meta.statusCounts || !meta.statusCounts[statusCode]) return 0;
  const cutoff = Date.now() - windowMs;
  return meta.statusCounts[statusCode].filter(ts => ts >= cutoff).length;
}

// Decide se escludere un endpoint basato su soglie di status in finestra temporale
export function shouldExcludeEndpoint(url: string): boolean {
  // thresholds: 429 >= 20 in last 60s, or 503 >= 5 in last 60s
  const windowMs = 60 * 1000;
  const c429 = countStatusInWindow(url, 429, windowMs);
  const c503 = countStatusInWindow(url, 503, windowMs);
  return c429 >= 20 || c503 >= 5;
}

export function getMetrics(url: string): MetricsMeta | undefined {
  return metricsMap[url];
}

// Non-invasive periodic logger: stampa un breve riepilogo metriche per endpoint
export function startNonInvasiveMetricsLogger(intervalMs = 30000) {
  // Metrics logging disabled: no periodic logging to console.
  // To re-enable, change this function to start an interval again.
  return;
}
