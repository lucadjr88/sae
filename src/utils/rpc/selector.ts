import { Connection } from '@solana/web3.js';
import { RpcPoolLoader } from './pool-loader.js';
import { IRpcSelector } from './types.js';

export class RpcSelector implements IRpcSelector {
  private roundRobinIndex = 0;

  constructor(private poolLoader: RpcPoolLoader) {}

  /**
   * Selects the next RPC based on round-robin, preferring healthy endpoints.
   * Skips endpoints that are unhealthy or in backoff.
   */
  pickNext(): { connection: Connection | null; index: number; url?: string } {
    const pool = this.poolLoader.getPool();
    const meta = this.poolLoader.getMeta();

    if (!pool || pool.length === 0) {
      console.log('[RpcSelector] No endpoints in pool');
      return { connection: null, index: -1 };
    }

    const now = Date.now();

    // Compute a simple score for each endpoint: prefer healthy, high success rate, low latency
    // Tunable parameters
    const LATENCY_SCALE = Number(process.env.RPC_SELECTOR_LATENCY_SCALE_MS) || 150; // scale for latency impact
    const SUCCESS_FLOOR = Number(process.env.RPC_SELECTOR_SUCCESS_FLOOR) || 0.4; // minimum success weight
    const TOP_K = Number(process.env.RPC_SELECTOR_TOP_K) || 3; // rotate among top-K (default 3)

    const scores: Array<{ idx: number; score: number }> = [];
    for (let idx = 0; idx < pool.length; idx++) {
      const e = pool[idx];
      const m = meta[idx];
      if (!m || !e) continue;

      // Skip if in backoff or explicitly unhealthy
      if (!m.healthy || (m.backoffUntil && m.backoffUntil > now)) {
        continue;
      }

      // Skip if concurrency limit reached
      const maxConcurrent = e.maxConcurrent || Number(process.env.RPC_MAX_CONCURRENT_PER_ENDPOINT || 8);
      if (m.currentConcurrent >= maxConcurrent) continue;

      const processed = Math.max(1, m.processedTxs || 0);
      const successRate = (m.successes || 0) / processed; // 0..1
      const avgLatency = m.avgLatencyMs || 600; // fallback

      // latencyScore: decays with latency; LATENCY_SCALE controls sensitivity
      const latencyScore = 1 / (1 + avgLatency / LATENCY_SCALE);
      // successScore: scaled success rate, ensure a reasonable floor to avoid starving new endpoints
      const successScore = Math.max(SUCCESS_FLOOR, successRate);

      const score = successScore * latencyScore;
      scores.push({ idx, score });
    }

    if (scores.length === 0) return { connection: null, index: -1, url: undefined };

    // Sort by score descending and pick one of top 3 (or top 1) in round-robin manner to avoid overloading single endpoint
    scores.sort((a, b) => b.score - a.score);
    const pickPool = Math.min(TOP_K, scores.length);
    // use roundRobinIndex to rotate within top group
    const choice = scores[this.roundRobinIndex % pickPool].idx;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % pickPool;

    const entry = pool[choice];
    return { connection: entry.connection || null, index: choice, url: entry.url };
  }

  /**
   * Reset round-robin counter (useful for testing)
   */
  reset(): void {
    this.roundRobinIndex = 0;
  }

  /**
   * Get the current round-robin index
   */
  getCurrentIndex(): number {
    return this.roundRobinIndex;
  }
}

export function createRpcSelector(poolLoader: RpcPoolLoader): RpcSelector {
  return new RpcSelector(poolLoader);
}
