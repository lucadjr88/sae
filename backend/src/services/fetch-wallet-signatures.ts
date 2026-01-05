import { getAccountTransactions } from './wallet/accountTransactions.js';
import { BATCH_SETTINGS } from '../config/wallet-fees-streaming-config.js';

export interface FetchWalletSignaturesOpts {
  rpcEndpoint: string;
  rpcWebsocket: string;
  wallet: string;
  cutoffTime: number;
  batchSize: number;
  maxTx: number;
  maxRetries: number;
  sendUpdate: (data: any) => void;
}

export async function fetchWalletSignatures(opts: FetchWalletSignaturesOpts): Promise<{ transactions: any[]; totalSignaturesFetched: number }> {
  const { rpcEndpoint, rpcWebsocket, wallet, cutoffTime, batchSize, maxTx, maxRetries, sendUpdate } = opts;

  let retryCount = 0;
  let fetchBatchSize = maxTx; // Start with full
  let fetchDelay = BATCH_SETTINGS.minDelay; // Start with normal
  let result: any = null;
  let allTransactions: any[] = [];
  let totalSigs = 0;

  while (retryCount < maxRetries) {
    try {
      sendUpdate({ type: 'progress', stage: 'signatures', message: `Fetching signatures... (attempt ${retryCount + 1}/${maxRetries})`, processed: 0, total: 0 });
      result = await getAccountTransactions(
        rpcEndpoint,
        rpcWebsocket,
        wallet,
        fetchBatchSize,
        cutoffTime,
        fetchBatchSize,
        { refresh: false } // TODO: pass refresh if needed
      );
      allTransactions = result.transactions;
      totalSigs = result.totalSignaturesFetched;

      if (totalSigs > 0) {
        sendUpdate({ type: 'progress', stage: 'signatures', message: `Found ${totalSigs} signatures`, processed: totalSigs, total: totalSigs });
        break;
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          fetchBatchSize = Math.max(500, fetchBatchSize / 2); // Halve batch size (min 500)
          fetchDelay = Math.min(BATCH_SETTINGS.maxDelay, fetchDelay * 2); // Double delay (max 5000ms)
          console.log(`[stream] Fetch retry ${retryCount}/${maxRetries} with batchSize=${fetchBatchSize}, delay=${fetchDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, fetchDelay * 10)); // Wait longer between retries (up to 50s)
        }
      }
    } catch (err) {
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error('[stream] Fetch failed after retries:', (err as any).message);
        throw err; // Re-throw to abort
      }
      fetchBatchSize = Math.max(500, fetchBatchSize / 2);
      fetchDelay = Math.min(BATCH_SETTINGS.maxDelay, fetchDelay * 2);
      console.log(`[stream] Fetch error retry ${retryCount}/${maxRetries}: ${(err as any).message}`);
      await new Promise(resolve => setTimeout(resolve, fetchDelay * 10));
    }
  }

  if (totalSigs === 0) {
    console.warn('[stream] Unable to fetch any signatures after retries, proceeding with empty data');
    sendUpdate({ type: 'progress', stage: 'signatures', message: 'No signatures found (rate limited)', processed: 0, total: 0 });
  }

  return { transactions: allTransactions, totalSignaturesFetched: totalSigs };
}