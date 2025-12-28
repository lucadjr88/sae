// Funzioni core estratte da pool-connection.ts

import { Connection } from '@solana/web3.js';
import { RpcOperationOptions, PoolContext } from './pool-connection-types.js';

/**
 * Esegue una promise con timeout
 */
export function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('RPC timeout')), timeoutMs)
    ),
  ]);
}

/**
 * Classifica il tipo di errore per la gestione del backoff
 */
export function classifyError(err: any): string {
  const message = (err?.message || String(err)).toLowerCase();
  if (message.includes('429') || message.includes('rate limit')) return '429';
  if (message.includes('402') || message.includes('insufficient') || message.includes('payment')) return '402';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  return 'other';
}


/**
 * Esegue un'operazione RPC con pool, timeout e retry, usando PoolContext
 */
export async function executeWithPool<T>(
  ctx: PoolContext,
  operation: (conn: any, rpcIndex: number) => Promise<T>,
  opts: RpcOperationOptions = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? ctx.defaultTimeoutMs ?? 15000;
  const maxRetries = opts.maxRetries ?? ctx.defaultMaxRetries ?? 3;
  const fallbackToDefault = false; // Pool only
  const logErrors = opts.logErrors !== false && (ctx.defaultLogErrors ?? true);

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const picked = ctx.poolManager.pickNextRpc();

      if (picked.index < 0 || !picked.connection) {
        if (fallbackToDefault) {
          try {
            const result = await executeWithTimeout(
              operation(ctx.defaultConnection, -1),
              timeoutMs
            );
            return result;
          } catch (err) {
            throw err;
          }
        }
        throw new Error('No healthy RPC endpoints available in pool');
      }

      if (!ctx.poolManager.tryAcquireRpc(picked.index)) {
        if (fallbackToDefault) {
          try {
            const result = await executeWithTimeout(
              operation(ctx.defaultConnection, -1),
              timeoutMs
            );
            return result;
          } catch (err) {
            throw err;
          }
        }
        throw new Error(`RPC endpoint ${picked.index} concurrency limit reached`);
      }

      const startTime = Date.now();
      try {
        const result = await executeWithTimeout(operation(picked.connection, picked.index), timeoutMs);
        const latencyMs = Date.now() - startTime;
        ctx.poolManager.releaseRpc(picked.index, { success: true, latencyMs });
        ctx.poolManager.recordRpcProcessed(picked.index, 1);
        return result;
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        const errorType = classifyError(err);
        ctx.poolManager.releaseRpc(picked.index, { success: false, latencyMs, errorType });
        lastError = err;
        if (errorType === '429' && attempt < maxRetries) {
          const base = opts?.rateLimitBackoffBaseMs ?? 1000;
          const backoffMs = Math.min(5000, base * (attempt + 1));
          try {
            const metrics = ctx.poolManager.getRpcMetricsAt(picked.index);
            const thresh = opts?.markUnhealthyOn429Threshold;
            if (thresh && metrics && (metrics.errorCounts?.rateLimit429 || 0) >= thresh) {
              ctx.poolManager.markRpcFailure(picked.index, '429-threshold');
              await new Promise(resolve => setTimeout(resolve, Math.min(2000, backoffMs)));
            }
          } catch {}
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        if (attempt === maxRetries && fallbackToDefault) {
          try {
            const result = await executeWithTimeout(
              operation(ctx.defaultConnection, -1),
              timeoutMs
            );
            return result;
          } catch (defaultErr) {
            lastError = defaultErr;
          }
        }
      }
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) {
        if (logErrors) {
          // Log solo errore finale
        }
        throw lastError;
      }
      const delayMs = Math.min(1000, (attempt + 1) * 200);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
