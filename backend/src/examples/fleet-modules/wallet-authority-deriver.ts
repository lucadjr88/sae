import { PublicKey } from "@solana/web3.js";
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';
import { setCache } from '../../utils/persist-cache.js';
import { derivSleep } from '../deriv-sleep.js';
import { WalletAuthorityDeriverInput, WalletAuthorityDeriverOutput } from './interfaces.js';

export async function deriveWalletAuthority(input: WalletAuthorityDeriverInput): Promise<WalletAuthorityDeriverOutput> {
  const { fleets, connection, playerProfilePubkey, cacheProfileId } = input;

  let walletAuthority: string | null = null;
  const primaryPayerCounts: Array<[string, number]> = [];
  const fallbackPayerCounts: Array<[string, number]> = [];
  let feePayerScannedDuringDerivation = false;

  // First, derive wallet by scanning recent tx across fleets and counting fee payers
  if (fleets.length > 0) {
    try {
      const payerCounts = new Map<string, number>();
      const sampleFleets = fleets.slice(0, Math.min(10, fleets.length));

      // Adaptive delay for wallet derivation phase
      let derivDelay = 100; // ms
      const MIN_DERIVE_DELAY = 80;
      const MAX_DERIVE_DELAY = 1500;
      const DERIVE_BACKOFF_MULTIPLIER = 1.5;
      let derivSuccesses = 0;
      let derivErrors = 0;

      // Create RPC pool connection once for reuse
      const poolConnection = new RpcPoolConnection(connection);

      for (const f of sampleFleets) {
        const fleetKey = (f as any).key.toString();

        // Use RPC pool for getSignaturesForAddress with timeout
        let signatures: any[] = [];
        let sigFetchSuccess = false;

        try {
          signatures = await poolConnection.getSignaturesForAddress(new PublicKey(fleetKey), {
            limit: 3,
            timeoutMs: 4000,
            maxRetries: 1,
            logErrors: false,
          });

          if (signatures.length > 0) {
            sigFetchSuccess = true;
            derivSuccesses++;
          } else {
            derivErrors++;
          }
        } catch (err) {
          derivErrors++;
        }

        // Process fetched signatures with timeout on getParsedTransaction
        for (const sig of signatures) {
          try {
            const tx = await poolConnection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
              timeoutMs: 3000,
              maxRetries: 0,
              logErrors: false,
            });

            if (tx) {
              const feePayer = tx?.transaction.message.accountKeys?.[0]?.pubkey?.toString();
              if (feePayer) payerCounts.set(feePayer, (payerCounts.get(feePayer) || 0) + 1);
              try {
                const cacheKey = cacheProfileId || feePayer;
                if (cacheKey) await setCache(cacheKey, 'wallet-txs', sig.signature, tx);
              } catch (e) {
                // ignore cache errors
              }
            }
          } catch (err) {
            // tolerate errors, poolConnection already handles fallback
          }
        }

        // Adaptive delay after each fleet (not just at end)
        if (sigFetchSuccess) {
          derivSuccesses++;
          if (derivSuccesses > 2) {
            derivDelay = Math.max(MIN_DERIVE_DELAY, derivDelay - 10);
            derivSuccesses = 0;
          }
        } else {
          derivErrors++;
          if (derivErrors > 1) {
            derivDelay = Math.min(MAX_DERIVE_DELAY, derivDelay * DERIVE_BACKOFF_MULTIPLIER);
            derivErrors = 0;
          }
        }

        // Apply delay before next fleet
        if (sampleFleets.indexOf(f) < sampleFleets.length - 1) {
          await derivSleep(derivDelay);
        }
      }

      // Pick the most frequent payer
      let topPayer: string | null = null;
      let topCount = 0;
      for (const [payer, count] of payerCounts.entries()) {
        if (count > topCount) { topCount = count; topPayer = payer; }
      }

      if (topPayer) {
        const totalPrimaryTxs = Array.from(payerCounts.values()).reduce((s, v) => s + v, 0);
        const proportion = totalPrimaryTxs > 0 ? (topCount / totalPrimaryTxs) : 0;
        // Accept primary-derived payer only if confident: either absolute occurrences or majority
        if (topCount >= 10 || proportion >= 0.5) {
          walletAuthority = topPayer;
          console.log('Derived wallet authority (tallied):', walletAuthority, 'from', topCount, 'occurrences', `(proportion=${proportion.toFixed(2)})`);
        } else {
          console.log('Primary derivation found candidate but confidence too low:', topPayer, topCount, 'of', totalPrimaryTxs, `(proportion=${proportion.toFixed(2)})`);
        }
      }

      // Save primary payer counts for diagnostics
      primaryPayerCounts.push(...Array.from(payerCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0, 20));

      // Fallback: if no walletAuthority found, perform a deeper scan across more signatures
      if (!walletAuthority) {
        try {
          console.log('[wallet-derive] Primary pass failed — running extended fallback scan');
          const fallbackPayers = new Map<string, number>();
          const fallbackFleets = fleets.slice(0, Math.min(20, fleets.length));
          let totalSigs = 0;
          let totalTxs = 0;

          for (const f of fallbackFleets) {
            const fk = (f as any).key.toString();
            let sigs: any[] = [];
            try {
              // Use RPC pool for fallback scan too
              sigs = await poolConnection.getSignaturesForAddress(new PublicKey(fk), {
                limit: 50,
                timeoutMs: 4000,
                maxRetries: 1,
                logErrors: false,
              });
            } catch (err) {
              console.warn(`[wallet-derive] Could not fetch signatures for ${fk}:`, (err as any)?.message || String(err));
              continue;
            }
            totalSigs += sigs.length;
            // Limit txs per fleet to avoid runaway usage
            const sigSlice = sigs.slice(0, 20);
            for (const s of sigSlice) {
              try {
                const ptx = await poolConnection.getParsedTransaction(s.signature, {
                  maxSupportedTransactionVersion: 0,
                  timeoutMs: 3000,
                  maxRetries: 0,
                  logErrors: false,
                });
                totalTxs++;
                if (!ptx) continue;
                const payer = ptx?.transaction?.message?.accountKeys?.[0]?.pubkey?.toString?.();
                if (payer) fallbackPayers.set(payer, (fallbackPayers.get(payer) || 0) + 1);
                try {
                  const cacheKey = cacheProfileId || payer;
                  if (cacheKey) await setCache(cacheKey, 'wallet-txs', s.signature, ptx);
                } catch (e) {
                  // ignore cache errors
                }
              } catch (err) {
                // tolerate errors
              }
            }
          }

          console.log(`[wallet-derive] Extended scan: signatures fetched=${totalSigs}, transactions parsed=${totalTxs}`);

          // Log top fallback payers for diagnostics
          const sorted = Array.from(fallbackPayers.entries()).sort((a,b) => b[1]-a[1]).slice(0,10);
          console.log('[wallet-derive] Fallback payer counts (top 10):', sorted);

          // Save fallback diagnostics
          fallbackPayerCounts.push(...Array.from(fallbackPayers.entries()).sort((a,b) => b[1]-a[1]).slice(0, 50));

          let best: string | null = null;
          let bestCount = 0;
          for (const [p, c] of fallbackPayers.entries()) {
            if (c > bestCount) { best = p; bestCount = c; }
          }

          if (best) {
            const proportionFallback = totalTxs > 0 ? (bestCount / totalTxs) : 0;
            // Accept fallback-derived payer if it meets absolute or proportional threshold
            if (bestCount >= 10 || proportionFallback >= 0.5) {
              walletAuthority = best;
              console.log('[wallet-derive] Fallback derived walletAuthority:', walletAuthority, 'count:', bestCount, `(proportion=${proportionFallback.toFixed(2)})`);
            } else {
              console.log('[wallet-derive] Fallback candidate found but confidence too low:', best, bestCount, 'of', totalTxs, `(proportion=${proportionFallback.toFixed(2)})`);
            }
          } else {
            console.warn('[wallet-derive] Fallback scan failed to derive walletAuthority');
          }
        } catch (err) {
          console.error('[wallet-derive] Extended fallback failed:', err);
        }
      }

      feePayerScannedDuringDerivation = true;
    } catch (error) {
      console.error('Error deriving wallet:', error);
    }
  }

  return {
    walletAuthority,
    primaryPayerCounts,
    fallbackPayerCounts,
    feePayerScannedDuringDerivation,
  };
}