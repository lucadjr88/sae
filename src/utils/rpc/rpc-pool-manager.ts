// rpc-pool-manager.ts
// Gestisce pool di endpoint RPC con logica di health, round robin, metrics, prune, ecc.
// Usa cache/<PROFILEID>/rpc-pool.json come lista endpoint attiva, se non esiste la crea con prune.


import fs from 'fs/promises';
import path from 'path';
import { Connection } from '@solana/web3.js';
import * as health from './health-manager';
import * as concurrency from './concurrency-manager';
import * as metrics from './metrics';
import { pickNext } from './selector';
import * as prune from './prune';

const RPC_POOL_NAMESPACE = 'rpc-pool';
const RPC_POOL_FILENAME = 'rpc-pool.json';
const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');


// In-memory cache per profileId per evitare letture FS ripetute
const poolCache: Record<string, any[]> = {};

export function resetPoolCache(profileId?: string) {
  if (profileId) {
    delete poolCache[profileId];
    return;
  }
  for (const key of Object.keys(poolCache)) {
    delete poolCache[key];
  }
}

// Carica pool da cache (in memoria -> disco), se non esiste crea con prune
export async function loadOrCreateRpcPool(profileId: string): Promise<any[]> {
  if (poolCache[profileId]) {
   return poolCache[profileId];
  }
  const dir = path.join(process.cwd(), 'cache', profileId);
  const file = path.join(dir, RPC_POOL_FILENAME);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    poolCache[profileId] = parsed;
    console.log(`[rpc-pool-manager] Caricato pool da cache/${profileId}/rpc-pool.json (${parsed.length} endpoint)`);
    return parsed;
  } catch {
    // Non esiste: crea con prune
    console.log(`[rpc-pool-manager] Pool non trovato per ${profileId}, eseguo prune...`);
    const valid = await prune.pruneEndpoints();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(valid, null, 2));
    poolCache[profileId] = valid;
    console.log(`[rpc-pool-manager] Pool pruned creato in cache/${profileId}/rpc-pool.json (${valid.length} endpoint)`);
    return valid;
  }
}


// Prune e aggiorna cache + file su disco
export async function pruneRpcPool(profileId?: string, force?: boolean): Promise<any[]> {
  // Allow undefined profileId in tests; use 'default' to avoid path.join errors
  const pid = profileId || 'default';
  const dir = path.join(process.cwd(), 'cache', pid);
  const file = path.join(dir, RPC_POOL_FILENAME);
  console.log(`[rpc-pool-manager] Eseguo prune per ${profileId}...`);
  const valid = await prune.pruneEndpoints();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(valid, null, 2));
  poolCache[pid] = valid;
  console.log(`[rpc-pool-manager] Pool pruned creato in cache/${pid}/rpc-pool.json (${valid.length} endpoint)`);
  return valid;
}



// Acquisisce una connessione dal pool con logica health-aware, fallback e adaptive concurrency
export async function pickRpcConnection(profileId: string, opts?: { allowStale?: boolean; waitForMs?: number }): Promise<{connection: any, endpoint: any, release: (opts?: { success?: boolean, latencyMs?: number, errorType?: string }) => void}> {
  const pool = await loadOrCreateRpcPool(profileId);
  // Ordina endpoint: healthy e non in backoff prima
  const healthy = pool.filter(ep => health.isHealthy(ep.url) && !health.isInBackoff(ep.url));
    const filteredHealthy = healthy.filter(ep => !metrics.shouldExcludeEndpoint(ep.url));
    let candidates = filteredHealthy.length > 0 ? filteredHealthy : healthy.length > 0 ? healthy : pool;

  const startTime = Date.now();
  const waitForMs = opts?.waitForMs ?? 0;
  const allowStale = !!opts?.allowStale;

  // Try to acquire within candidates; optionally wait a bit if all busy
  while (true) {
    for (let i = 0; i < candidates.length; i++) {
      const ep = candidates[i];
      // if not healthy but allowStale is true we still try to use it
      if (!allowStale && health.isInBackoff(ep.url)) continue;
      // Try acquire (returns boolean)
    const acquired = concurrency.acquire(ep.url, ep.maxConcurrent || 2);
      if (!acquired) continue;
      const connection = new Connection(ep.url, { commitment: 'confirmed' });
      const release = (r?: { success?: boolean, latencyMs?: number, errorType?: string }) => {
        concurrency.release(ep.url);
        if (r?.success) {
          health.recordSuccess(ep.url);
          metrics.recordProcessed(ep.url);
          if (r.latencyMs) metrics.recordLatency(ep.url, r.latencyMs);
          concurrency.increaseMaxConcurrent(ep.url);
        } else {
          const is429 = r?.errorType === '429';
          const is503 = r?.errorType === '503';
          health.recordFailure(ep.url);
          metrics.recordError(ep.url);
          concurrency.decreaseMaxConcurrent(ep.url);
          if (is429) {
            const meta = health.getHealthMeta(ep.url);
            if (meta) {
              const base = 60000; // 60s
              const jitter = Math.floor(Math.random() * 60000);
              meta.backoffUntil = Date.now() + base + jitter;
            }
            metrics.recordStatusCode(ep.url, 429);
          }
          if (is503) {
            const meta = health.getHealthMeta(ep.url);
            if (meta) {
              const base = 60000;
              const jitter = Math.floor(Math.random() * 60000);
              meta.backoffUntil = Date.now() + base + jitter;
            }
            metrics.recordStatusCode(ep.url, 503);
          }
        }
      };
      return { connection, endpoint: ep, release };
      }
    // none acquired: decide cosa fare
    if (allowStale && candidates.length > 0) {
      // try to force-acquire the first candidate skipping concurrency
      const ep = candidates[0];
      const connection = new Connection(ep.url, { commitment: 'confirmed' });
      const release = (r?: { success?: boolean, latencyMs?: number, errorType?: string }) => {
        // ensure release doesn't call release twice since we didn't acquire
        if (concurrency.canAcquire(ep.url)) {
          // nothing to release
        } else {
          concurrency.release(ep.url);
        }
        if (r?.success) {
          health.recordSuccess(ep.url);
          metrics.recordProcessed(ep.url);
          if (r.latencyMs) metrics.recordLatency(ep.url, r.latencyMs);
          concurrency.increaseMaxConcurrent(ep.url);
        } else {
          const is429 = r?.errorType === '429';
          health.recordFailure(ep.url);
          metrics.recordError(ep.url);
          concurrency.decreaseMaxConcurrent(ep.url);
          if (is429) {
            // Aggressive backoff for 429: 30-60s with jitter
            const meta = health.getHealthMeta(ep.url);
            if (meta) {
              const base = 30000; // 30s
              const jitter = Math.floor(Math.random() * 30000); // up to +30s
              meta.backoffUntil = Date.now() + base + jitter;
            }
          }
        }
      };
      return { connection, endpoint: ep, release };
    }

    if (waitForMs > 0 && Date.now() - startTime < waitForMs) {
      // brief sleep then retry
      await new Promise(res => setTimeout(res, 100));
      continue;
    }

    throw new Error('No available RPC endpoint');
  }
}


// Esporta API principale
export const RpcPoolManager = {
  loadOrCreateRpcPool,
  pruneRpcPool,
  // ensurePool: unified API to ensure pool exists or force refresh
  async ensurePool(profileId?: string, force?: boolean) {
    if (force) return await pruneRpcPool(profileId, true);
    return await loadOrCreateRpcPool(profileId || 'default');
  },
  pickRpcConnection,
  health,
  concurrency,
  metrics,
  pickNext,
  prune,
};
