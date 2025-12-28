import { PublicKey } from "@solana/web3.js";
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';
import { createRpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';
import { getCacheDataOnly, setCache } from '../../utils/persist-cache.js';
import { nlog } from '../../utils/log-normalizer.js';
import { byteArrayToString } from "@staratlas/data-source";
import { SAGE_PROGRAM_ID } from '../fleets-constants.js';
import {
  WALLET_SIG_BATCH,
  WALLET_FETCH_TIMEOUT_MS,
  WALLET_MAX_RETRIES,
  WALLET_BACKOFF_BASE_MS,
  WALLET_MARK_UNHEALTHY,
  WALLET_BATCH_DELAY_MS,
  MIN_DELAY,
  MAX_DELAY,
  BACKOFF_MULTIPLIER,
  SUCCESS_DECREASE_STEP
} from '../wallet-scan-constants.js';
import { WalletTransactionScannerInput, WalletTransactionScannerOutput } from './interfaces.js';

export async function scanWalletTransactions(input: WalletTransactionScannerInput): Promise<WalletTransactionScannerOutput> {
  const { walletAuthority, connection, knownFleetKeys, sageProgram } = input;

  const additionalFleets: any[] = [];
  const walletHeuristicKeys = new Set<string>();
  const operatedByWalletKeys = new Set<string>();

  // OPTIMIZED: Analyze wallet transactions and extract SAGE fleet accounts
  if (walletAuthority) {
    try {
      console.log('Analyzing wallet transactions for SAGE fleet involvement (optimized)...');
      const cutoffMs = Date.now() - (24 * 60 * 60 * 1000); // 24h cutoff

      // Collect wallet signatures with early cutoff - process in chunks
      const walletSignatures: any[] = [];
      let before: string | undefined = undefined;
      const maxToAnalyze = 5000; // Allow more for 24h coverage, but process efficiently
      let fetchBatchCount = 0;

      // Adaptive delay like in account-transactions.ts
      let currentDelay = 120; // ms
      let successStreak = 0;
      let consecutiveErrors = 0;

      function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

      // Create pool connection for wallet signature scanning
      const poolConnection2 = new RpcPoolConnection(connection);

      while (walletSignatures.length < maxToAnalyze) {
        fetchBatchCount++;

        // Use RPC pool with retry logic
        let batch: any[] = [];
        let batchSuccess = false;
        try {
          batch = await poolConnection2.getSignaturesForAddress(
            new PublicKey(walletAuthority),
            {
              limit: WALLET_SIG_BATCH,
              before,
              timeoutMs: WALLET_FETCH_TIMEOUT_MS,
              maxRetries: WALLET_MAX_RETRIES,
              rateLimitBackoffBaseMs: WALLET_BACKOFF_BASE_MS,
              markUnhealthyOn429Threshold: WALLET_MARK_UNHEALTHY,
              logErrors: false,
            }
          );
          batchSuccess = true;
        } catch (err: any) {
          // Handle rate limiting
          if (err?.message?.includes('429')) {
            nlog('[wallet-scan] Rate limited (429), backoff delay: ' + currentDelay + 'ms');
            consecutiveErrors++;
            if (consecutiveErrors > 2) {
              currentDelay = Math.min(MAX_DELAY, currentDelay * BACKOFF_MULTIPLIER);
            }
            await sleep(Math.max(1000, currentDelay));
          }
          batch = [];
        }

        // Log RPC metrics every batch
        const metrics = poolConnection2.getMetrics();
        const healthyCount = metrics.filter(m => m.healthy).length;
        const totalProcessed = metrics.reduce((sum, m) => sum + m.processedTxs, 0);
        const avgLatency = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + (m.avgLatencyMs || 0), 0) / metrics.length) : 0;

        nlog(`[wallet-scan] Batch ${fetchBatchCount}: ${batch.length} sigs, total: ${walletSignatures.length}, delay: ${currentDelay}ms | RPC: ${healthyCount}/${metrics.length} healthy, ${totalProcessed} processed, ${avgLatency}ms avg latency`);

        // Adaptive delay after each batch
        if (batchSuccess) {
          successStreak++;
          consecutiveErrors = 0;
          if (successStreak > 3) {
            currentDelay = Math.max(MIN_DELAY, currentDelay - SUCCESS_DECREASE_STEP);
            successStreak = 0;
          }
        } else {
          successStreak = 0;
          if (batch.length > 0) {
            // Soft failure, had some results
            consecutiveErrors++;
            if (consecutiveErrors > 1) {
              currentDelay = Math.min(MAX_DELAY, currentDelay * BACKOFF_MULTIPLIER);
            }
          }
        }

        // Apply delay before next batch
        if (walletSignatures.length < maxToAnalyze && batch.length > 0) {
            await sleep(currentDelay);
        }

        if (batch.length === 0) break;

        for (const sig of batch) {
          const btMs = sig.blockTime ? sig.blockTime * 1000 : 0;
          // Early cutoff if older than 24h
          if (sig.blockTime && btMs < cutoffMs) {
            nlog(`[wallet-scan] cutoff reached at ${new Date(btMs).toISOString()}`);
            break;
          }
          walletSignatures.push(sig);
          if (walletSignatures.length >= maxToAnalyze) break;
        }

        if (walletSignatures.length >= maxToAnalyze) break;
        const last = batch[batch.length - 1];
        before = last.signature;
        if (last.blockTime && (last.blockTime * 1000) < cutoffMs) break;
      }

      nlog(`[wallet-scan] Collected ${walletSignatures.length} signatures`);

      // Now extract fleet accounts from these transactions efficiently
      const preAnalysisMetrics = poolConnection2.getMetrics();
      const preHealthy = preAnalysisMetrics.filter(m => m.healthy).length;
      nlog(`[tx-analysis] Processing ${walletSignatures.length} wallet transactions...`);
      nlog(`[tx-analysis] RPC pool status: ${preHealthy}/${preAnalysisMetrics.length} healthy endpoints`);

      let analyzedCount = 0;
      const fleetCandidates = new Set<string>();
      const startTime = Date.now();

      // Create RPC pool connection for parallelized fetching
      // Use a local RpcPoolManager with conservative settings for this heavy scanning phase
      const localPoolManager = createRpcPoolManager();
      // Keep per-endpoint concurrency as configured; avoid forcing very low limits here
      try {
        // Increase backoff and cooldown for this phase to let rate-limited endpoints recover
        const hm: any = localPoolManager.getHealthManager();
        if (typeof hm.setBackoffBaseMs === 'function') hm.setBackoffBaseMs(2000);
        if (typeof hm.setCooldownMs === 'function') hm.setCooldownMs(120000);
      } catch (e) {
        // ignore
      }
      const poolConnection = new RpcPoolConnection(connection, localPoolManager);

      // Parallelized processing: fetch transactions in chunks and process concurrently
      // Use a larger local chunk size to utilize more of the healthy endpoints
      const chunkSize = Math.min(400, Math.max(80, Math.floor(walletSignatures.length > 0 ? walletSignatures.length / 4 : 200)));
      const timeoutMs = 12000; // per-request timeout for this phase (increased to tolerate slower endpoints)

      function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
        return new Promise(resolve => {
          let done = false;
          const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
          p.then(r => { if (!done) { done = true; clearTimeout(timer); resolve(r); } }).catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
        });
      }

      for (let i = 0; i < walletSignatures.length; i += chunkSize) {
        const batch = walletSignatures.slice(i, i + chunkSize);
        const fetchPromises: Promise<any | null>[] = batch.map(async (s: any) => {
          // Try cache first (per-wallet folder) before hitting RPC
          try {
            const cached: any = await getCacheDataOnly<any>(`wallet-txs/${walletAuthority}`, s.signature);
            if (cached) return cached;
          } catch (e) {
            // ignore cache read errors
          }
          return withTimeout(
            poolConnection.getTransaction(s.signature, {
              maxSupportedTransactionVersion: 0,
              timeoutMs,
              maxRetries: 0,
            }),
            timeoutMs + 500
          );
        });
        const results: (any | null)[] = await Promise.all(fetchPromises);

        for (let j = 0; j < results.length; j++) {
          const tx: any = results[j];
          analyzedCount++;
          if (analyzedCount % 25 === 0 || analyzedCount === 1) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (analyzedCount / (Date.now() - startTime) * 1000).toFixed(2);
            const metrics = poolConnection.getMetrics();
            const healthyCount = metrics.filter(m => m.healthy).length;
            const totalSuccesses = metrics.reduce((sum, m) => sum + m.successes, 0);
            const totalFailures = metrics.reduce((sum, m) => sum + m.failures, 0);
            const successRate = totalSuccesses + totalFailures > 0 ? ((totalSuccesses / (totalSuccesses + totalFailures)) * 100).toFixed(0) : '0';
            const avgLatency = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + (m.avgLatencyMs || 0), 0) / metrics.filter(m => m.avgLatencyMs).length) : 0;
            console.log(`[tx-analysis]\t${analyzedCount}/${walletSignatures.length} txs\t${elapsed}s\t${rate} tx/s\t${healthyCount}/${metrics.length} RPC\t${successRate}% ok\t${avgLatency}ms`);
          }

          if (!tx) {
            if (analyzedCount % 200 === 0) console.log(`[tx-analysis] Warning: tx ${analyzedCount} returned null or timed out`);
            continue;
          }

          // Cache raw transaction per fee payer when possible
          try {
            const sigObj = batch[j];
            const sigStr = sigObj && sigObj.signature ? sigObj.signature : undefined;
            const feePayer = (tx as any).transaction?.message?.accountKeys?.[0]?.pubkey?.toString?.() ||
              ((tx as any).transaction?.message?.accountKeys && (tx as any).transaction?.message?.accountKeys[0] && (tx as any).transaction?.message?.accountKeys[0].toString && (tx as any).transaction?.message?.accountKeys[0].toString());
            if (feePayer && sigStr) {
              try { await setCache(`wallet-txs/${feePayer}`, sigStr, tx); } catch (e) { /* ignore cache errors */ }
            }
          } catch (e) {
            // ignore cache errors
          }

          try {
            const accountKeys: any[] = (tx as any).transaction?.message?.staticAccountKeys || (tx as any).transaction?.message?.accountKeys || [];
            const hasSage = accountKeys.some((key: any) => key && key.toString && key.toString() === SAGE_PROGRAM_ID);
            if (!hasSage) continue;
            for (const accountKey of accountKeys) {
              const account: string = accountKey.toString();
              if (knownFleetKeys.has(account)) continue;
              if (account === SAGE_PROGRAM_ID) continue;
              if (account === walletAuthority) continue;
              fleetCandidates.add(account);
            }
          } catch (e) {
            // tolerate per-tx parse errors
          }
        }
        // brief pause between batches to reduce burst pressure
        await new Promise(resolve => setTimeout(resolve, WALLET_BATCH_DELAY_MS + Math.floor(Math.random() * 40)));
      }
      console.log(`[tx-analysis] Found ${fleetCandidates.size} potential fleet accounts from transactions`);

      // Now verify which candidates are actually fleet accounts (536 bytes, SAGE owner)
      // Use batched `getMultipleAccountsInfo` to speed up verification and avoid per-account RTTs.
      const VERIFY_CHUNK_SIZE = 100; // tune: larger = faster but more bursty
      const VERIFY_TIMEOUT_MS = 7000;
      const VERIFY_MAX_RETRIES = 1;
      const VERIFY_BACKOFF_BASE_MS = 500;
      const VERIFY_MARK_UNHEALTHY = 10;

      const poolForVerify = new RpcPoolConnection(connection);
      const candidatesArr = Array.from(fleetCandidates);
      let verifiedCount = 0;
      const additionalFleetKeys = new Set<string>();

      for (let i = 0; i < candidatesArr.length; i += VERIFY_CHUNK_SIZE) {
        const window = candidatesArr.slice(i, i + VERIFY_CHUNK_SIZE).map(k => new PublicKey(k));
        if (i % (VERIFY_CHUNK_SIZE * 1) === 0) {
          console.log(`[tx-analysis] verifying ${Math.min(i + VERIFY_CHUNK_SIZE, candidatesArr.length)}/${candidatesArr.length} candidates...`);
        }

        try {
          const infos = await poolForVerify.getMultipleAccountsInfo(window, {
            timeoutMs: VERIFY_TIMEOUT_MS,
            maxRetries: VERIFY_MAX_RETRIES,
            rateLimitBackoffBaseMs: VERIFY_BACKOFF_BASE_MS,
            markUnhealthyOn429Threshold: VERIFY_MARK_UNHEALTHY,
          });

          // Evaluate results
          for (let j = 0; j < infos.length; j++) {
            const info = infos[j];
            const candidate = candidatesArr[i + j];
            if (!info) continue;
            try {
              if (info.owner.toBase58() === SAGE_PROGRAM_ID && info.data.length === 536) {
                additionalFleetKeys.add(candidate);
                verifiedCount++;
              }
            } catch { /* ignore malformed */ }
          }

          // small jittered pause between batches to reduce burst
          const jitter = Math.floor(Math.random() * 100);
          await new Promise(resolve => setTimeout(resolve, 30 + jitter));
        } catch (err) {
          console.warn(`[tx-analysis] Error verifying chunk ${i}-${i + VERIFY_CHUNK_SIZE - 1}: ${err instanceof Error ? err.message : String(err)}`);
          // backoff a bit on chunk error
          const jitter = Math.floor(Math.random() * 200);
          await new Promise(resolve => setTimeout(resolve, 200 + jitter));
        }
      }
      console.log(`[tx-analysis] Found ${additionalFleetKeys.size} verified fleet accounts with recent wallet activity (verified ${verifiedCount})`);

      console.log(`[tx-analysis] Found ${additionalFleetKeys.size} verified fleet accounts with recent wallet activity`);

      // Fetch full fleet data for additional fleets
      for (const fleetKey of additionalFleetKeys) {
        try {
          // Fetch by direct pubkey via Anchor account fetch
          const fleetPubkey = new PublicKey(fleetKey);
          // @ts-ignore - account type name from IDL
          const accountData = await (sageProgram.account as any).fleet.fetch(fleetPubkey);
          if (accountData) {
            const wrapped = {
              type: 'ok',
              key: fleetPubkey,
              data: { data: accountData },
            } as any;
            additionalFleets.push(wrapped);
            knownFleetKeys.add(fleetKey);
            console.log(`Added rented fleet (wallet heuristic): ${byteArrayToString((accountData as any).fleetLabel)}`);
            walletHeuristicKeys.add(fleetKey);
            operatedByWalletKeys.add(fleetKey);
          }
        } catch (error) {
          console.error(`Error fetching fleet ${fleetKey}:`, error);
        }
      }

    } catch (error) {
      console.error('Error searching for rented fleets:', error);
    }
  }

  return {
    additionalFleets,
    walletHeuristicKeys,
    operatedByWalletKeys,
  };
}