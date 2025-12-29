import { PublicKey } from "@solana/web3.js";
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';
import { getCacheWithTimestamp, setCache } from '../../utils/persist-cache.js';
import { withRetry } from '../../utils/anchor-setup.js';
import { nlog } from '../../utils/log-normalizer.js';
import { byteArrayToString, readFromRPC } from "@staratlas/data-source";
import { SRSLY_PROGRAM_ID, SAGE_PROGRAM_ID } from '../fleets-constants.js';
import { Fleet } from "@staratlas/sage";
import { SrslyRentalScannerInput, SrslyRentalScannerOutput } from './interfaces.js';

export async function scanSrslyRentals(input: SrslyRentalScannerInput): Promise<SrslyRentalScannerOutput> {
  const { playerProfilePubkey, connection, knownFleetKeys, sageProgram } = input;

  const srslyFleets: any[] = [];
  const srslyHeuristicKeys = new Set<string>();

  // NEW: SRSLY rentals scan - identify fleets referenced by the rentals program for this profile
  try {
    console.log('Scanning SRSLY rentals to augment rented fleets...');
    const srslyProgramKey = new PublicKey(SRSLY_PROGRAM_ID);

    // Retry logic for SRSLY scan with exponential backoff
    let accounts: any[] | undefined;
    // Use RpcPoolConnection for program account fetch to distribute load
    const poolForSrsly = new RpcPoolConnection(connection);

    // Try cache first (cache SRSLY program accounts for short TTL to avoid repeated heavy scans)
    try {
      const cacheKey = 'srsly_program_accounts';
      const cached = await getCacheWithTimestamp<any[]>('srsly', cacheKey);
      const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
      if (cached && (Date.now() - cached.savedAt) < CACHE_TTL_MS) {
        accounts = cached.data;
        nlog('[SRSLY] Using cached program accounts');
      }
    } catch (e) {
      // ignore cache errors
    }

    if (!accounts) {
      let srslyRetries = 0;
      const maxSrslyRetries = 3;
      while (srslyRetries < maxSrslyRetries) {
        try {
          console.log(`[SRSLY] Fetch attempt ${srslyRetries + 1} via RPC pool...`);
          const beforeMetrics = poolForSrsly.getMetrics();
          accounts = await withRetry(() => poolForSrsly.getProgramAccounts(srslyProgramKey, { timeoutMs: 20000, maxRetries: 5, rateLimitBackoffBaseMs: 1000, markUnhealthyOn429Threshold: 10 }));
          const afterMetrics = poolForSrsly.getMetrics();
          console.log(`[SRSLY] Successfully fetched program accounts (attempt ${srslyRetries + 1}) - accounts=${(accounts||[]).length}`);
          //nlog(`[SRSLY] pool metrics before=${JSON.stringify(beforeMetrics.map(m=>({i:m.index,processed:m.processedTxs,fail:m.failures,429:m.errorCounts.rateLimit429})))}`);
          //nlog(`[SRSLY] pool metrics after=${JSON.stringify(afterMetrics.map(m=>({i:m.index,processed:m.processedTxs,fail:m.failures,429:m.errorCounts.rateLimit429})))}`);

          // Save to cache for short TTL
          try { await setCache('srsly', 'srsly_program_accounts', accounts || []); } catch (e) {}

          break;
        } catch (err) {
          srslyRetries++;
          const delay = Math.min(1000 * Math.pow(2, srslyRetries), 5000); // exponential backoff, max 5s
          console.warn(`[SRSLY] Fetch failed (attempt ${srslyRetries}/${maxSrslyRetries}): ${err instanceof Error ? err.message : String(err)}`);
          if (srslyRetries < maxSrslyRetries) {
            console.log(`[SRSLY] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!accounts) {
        console.warn('[SRSLY] Failed to fetch program accounts after retries, skipping SRSLY scan');
        accounts = [];
      }
    }

    // Helper to find byte subsequence
    const bufIncludes = (haystack: Uint8Array, needle: Uint8Array) => {
      outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
          if (haystack[i + j] !== needle[j]) continue outer;
        }
        return i;
      }
      return -1;
    };

    const borrowerBytes = playerProfilePubkey.toBytes();
    const srslyWithBorrower = accounts.filter(a => a.account.data && bufIncludes(a.account.data, borrowerBytes) !== -1);
    console.log(`[SRSLY] Found ${srslyWithBorrower.length} accounts referencing borrower profile`);
    if (srslyWithBorrower.length > 0) {
      try {
        const details = srslyWithBorrower.slice(0, 20).map((entry: any, idx: number) => {
          const pub = entry.pubkey && typeof entry.pubkey.toBase58 === 'function' ? entry.pubkey.toBase58() : String(entry.pubkey || '<unknown>');
          const len = entry.account && entry.account.data ? entry.account.data.length : 0;
          const matchIndex = bufIncludes(entry.account.data, borrowerBytes);
          return { i: idx, pubkey: pub, dataLen: len, matchIndex };
        });
        //nlog(`[SRSLY] referencing accounts details (first ${details.length}): ${JSON.stringify(details)}`);
      } catch (e) {
        nlog('[SRSLY] Failed to serialize referencing account details: ' + (e && (e as any).message ? (e as any).message : String(e)));
      }
    }

    // From those accounts, collect all 32-byte windows and probe for SAGE fleet accounts
    const candidateKeys = new Set<string>();
    for (const { account } of srslyWithBorrower) {
      const data = account.data;
      if (!data || data.length < 32) continue;
      for (let i = 0; i <= data.length - 32; i++) {
        const slice = data.subarray(i, i + 32);
        try {
          const pk = new PublicKey(slice);
          candidateKeys.add(pk.toBase58());
        } catch { /* ignore invalid keys */ }
      }
    }

    // Batch-check candidates in chunks with error handling
    const candidates = Array.from(candidateKeys);
    console.log(`[SRSLY] Checking ${candidates.length} candidate fleet keys...`);
    const chunkSize = 10; // reduced to lower burst per endpoint
    const discoveredFleetKeys: string[] = [];
    // Use pool to check candidate batches (distribute across endpoints)
    const poolForBatch = new RpcPoolConnection(connection);
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize).map(k => new PublicKey(k));
      try {
        console.log(`[SRSLY] Checking candidate batch ${i}-${Math.min(i+chunkSize-1,candidates.length-1)} (size=${chunk.length}) via pool`);
        const infos = await poolForBatch.getMultipleAccountsInfo(chunk, { timeoutMs: 10000, maxRetries: 5, rateLimitBackoffBaseMs: 1000, markUnhealthyOn429Threshold: 10 });
        for (let j = 0; j < chunk.length; j++) {
          const info = infos[j];
          if (!info) continue;
          if (info.owner.toBase58() === SAGE_PROGRAM_ID && info.data.length === 536) {
            const k = chunk[j].toBase58();
            if (!knownFleetKeys.has(k)) {
              discoveredFleetKeys.push(k);
              console.log(`[SRSLY] Discovered candidate fleet: ${k.substring(0, 8)}...`);
            }
          }
        }
        // Small delay with jitter between batches to avoid bursts
        const jitter = Math.floor(Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, 100 + jitter));
      } catch (err) {
        console.warn(`[SRSLY] Error checking candidate batch: ${err instanceof Error ? err.message : String(err)}`);
        // On error backoff slightly before next batch
        const jitter = Math.floor(Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, 200 + jitter));
      }
    }

    // Fetch and append these fleets as rented
    console.log(`[SRSLY] Fetching ${discoveredFleetKeys.length} discovered fleets...`);
    // Use RpcPoolConnection for fleet fetching to handle RPC failures
    const poolForFleetFetch = new RpcPoolConnection(connection);
    for (const k of discoveredFleetKeys) {
      try {
        const fleetPubkey = new PublicKey(k);
        // Use readFromRPC with RpcPoolConnection instead of Anchor
        let accountData = null;
        let retries = 3;
        let delay = 1000; // start with 1s

        while (retries > 0 && !accountData) {
          try {
            const result = await readFromRPC(
              poolForFleetFetch as any, // Cast to Connection type expected by readFromRPC
              sageProgram as any,
              fleetPubkey,
              Fleet,
              'processed'
            );
            
            if (result.type === 'ok') {
              accountData = result.data.data;
            }
          } catch (error) {
            retries--;
            if (retries > 0) {
              console.warn(`Error fetching fleet ${k}, retrying in ${delay}ms (${retries} retries left):`, error instanceof Error ? error.message : String(error));
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2; // exponential backoff
            } else {
              console.error(`Error fetching fleet ${k} after all retries:`, error);
            }
          }
        }

        if (accountData) {
          const wrapped = {
            type: 'ok',
            key: fleetPubkey,
            data: { data: accountData },
          } as any;
          srslyFleets.push(wrapped);
          knownFleetKeys.add(k);
          console.log(`[SRSLY] Added rented fleet: ${byteArrayToString((accountData as any).fleetLabel)}`);
          srslyHeuristicKeys.add(k);
        }
      } catch (e) {
        console.warn(`[SRSLY] Failed to fetch fleet ${k.substring(0, 8)}...: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log(`[SRSLY] Scan complete: ${discoveredFleetKeys.length} new fleets discovered`);
  } catch (e) {
    console.error('[SRSLY] Scan failed (non-fatal), continuing without SRSLY data:', e instanceof Error ? e.message : String(e));
  }

  return {
    srslyFleets,
    srslyHeuristicKeys,
  };
}