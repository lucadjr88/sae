import { IRpcPool } from './IRpcPool.js';
import { getGlobalRpcPoolManager } from '../utils/rpc/rpc-pool-manager';
import { getAccountTransactions } from '../examples/account-transactions';
import { newConnection } from '../utils/anchor-setup';
import { RpcPoolConnection } from '../utils/rpc/pool-connection';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../config/serverConfig';

export class RpcPoolAdapter implements IRpcPool {
  private pool = getGlobalRpcPoolManager();

  async pick(): Promise<number> {
    // pickNextRpc restituisce { index, ... }
    const { index } = this.pool.pickNextRpc();
    return index;
  }
  async acquire(index: number): Promise<void> {
    // tryAcquireRpc restituisce boolean, true se acquisito
    if (!this.pool.tryAcquireRpc(index)) {
      throw new Error('Unable to acquire RPC slot');
    }
  }
  async release(index: number, opts?: { success?: boolean; latencyMs?: number }): Promise<void> {
    this.pool.releaseRpc(index, opts);
  }
  getMetrics(): any {
    return this.pool.getRpcMetrics();
  }
}

// Adapter: aggiunge fetchTransactions per compatibilità con orchestratore
export class RpcPoolAdapterWithFetch extends RpcPoolAdapter {
  constructor(pool: IRpcPool) {
    super();
    // Sostituisci l'istanza interna con quella passata
    (this as any).pool = pool;
  }
  async fetchTransactions(walletPubkey: string, limit: number = 100, opts?: { hours?: number, refresh?: boolean }): Promise<any[]> {
    try {
      // Compute cutoff based on hours option (convert to unix ms)
      const hours = (opts && typeof opts.hours === 'number') ? opts.hours : 24;
      const sinceUnixMs = Date.now() - (hours * 60 * 60 * 1000);
      // Build a pool-backed connection and delegate to existing helper
      const defaultConn = newConnection(RPC_ENDPOINT, RPC_WEBSOCKET);
      const poolConn = new RpcPoolConnection(defaultConn, getGlobalRpcPoolManager());
      const res = await getAccountTransactions(
        RPC_ENDPOINT,
        RPC_WEBSOCKET,
        walletPubkey,
        limit,
        sinceUnixMs,
        5000,
        { refresh: opts?.refresh },
        poolConn
      );
      return res.transactions || [];
    } catch (err) {
      // On failure, log and return empty array to let caller handle gracefully
      console.error('[RpcPoolAdapterWithFetch] fetchTransactions error:', (err as any)?.message || err);
      return [];
    }
  }
}
