// Funzioni di logging estratte da pool-connection.ts

import { nlog } from '../log-normalizer.js';

export function logAggregatedStats(poolManager: any, txCounter: number, LOG_BATCH_SIZE: number, lastLogTime: number): number {
  if (txCounter % LOG_BATCH_SIZE !== 0) return lastLogTime;

  const metrics = poolManager.getRpcMetrics();
  const now = Date.now();
  const timeDiff = now - lastLogTime;

  const totalTxs = metrics.reduce((sum: number, m: any) => sum + m.processedTxs, 0);
  const totalSuccesses = metrics.reduce((sum: number, m: any) => sum + m.successes, 0);
  const totalFailures = metrics.reduce((sum: number, m: any) => sum + m.failures, 0);
  const rate429 = metrics.reduce((sum: number, m: any) => sum + m.errorCounts.rateLimit429, 0);
  const rate402 = metrics.reduce((sum: number, m: any) => sum + m.errorCounts.payment402, 0);
  const txPerSecond = Math.round((LOG_BATCH_SIZE / timeDiff) * 1000);

  const healthyEndpoints = metrics.filter((m: any) => m.healthy).length;
  const healthStatus = healthyEndpoints === metrics.length ? 'OK' : `${healthyEndpoints}/${metrics.length}`;
  const endpointSummary = metrics
    .filter((m: any) => m.processedTxs > 0)
    .map((m: any) => `E${m.index}:${m.processedTxs}`)
    .join(' ');

  nlog(
    `[RPC]\t${totalTxs}tx\t${txPerSecond}tx/s\t${totalSuccesses}ok\t${totalFailures}fail\t429:${rate429}\t402:${rate402}\t${healthStatus}\t${endpointSummary}`
  );
  return now;
}
