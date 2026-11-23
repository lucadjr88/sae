import type { Connection } from '@solana/web3.js';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';

export function getRentalRpcErrorType(error: unknown): '429' | '503' | 'error' {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (status === 429 || /429|Too Many Requests/i.test(message)) return '429';
  if (status === 503 || /503|Service Unavailable/i.test(message)) return '503';
  return 'error';
}

export async function executeRentalRpc<T>(
  profileId: string,
  operation: (connection: Connection) => Promise<T>,
): Promise<T> {
  const cleanedProfileId = typeof profileId === 'string' ? profileId.trim() : '';
  const normalizedProfileId = cleanedProfileId.length > 0 ? cleanedProfileId : 'default';
  const pool = await RpcPoolManager.loadOrCreateRpcPool(normalizedProfileId);
  const maxAttempts = Math.max(4, Math.round(pool.length * 1.5));
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | null = null;
    const startedAt = Date.now();

    try {
      pick = await RpcPoolManager.pickRpcConnection(normalizedProfileId, {
        waitForMs: 3000,
        allowStale: attempt > 2,
      });
      const result = await operation(pick.connection as Connection);
      pick.release({ success: true, latencyMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      if (pick) {
        pick.release({
          success: false,
          latencyMs: Date.now() - startedAt,
          errorType: getRentalRpcErrorType(error),
        });
      }
      lastError = error;
      console.error(`[rent-rpc] attempt ${attempt + 1}/${maxAttempts} failed for profile ${normalizedProfileId}:`, error);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('RPC request failed');
}
