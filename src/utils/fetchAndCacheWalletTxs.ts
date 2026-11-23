// Fetch e cache delle transazioni raw per un wallet
// (mock: da implementare fetch reale via RPC)

import { getCacheStrict, setCache, setCacheAtomic } from './cache.js';
import { normalizeRawTx } from './normalizeRawTx.js';

export async function getCachedWalletTransaction(wallet: string, signature: string, profileId: string) {
  const cached = await getCacheStrict(`wallet-txs/${wallet}`, signature, profileId);
  if (!cached) return null;
  const tx = cached.data;
  if (tx?.signature === signature && typeof tx.slot === 'number' && tx.transaction?.message) return tx;
  console.warn(`[wallet-txs] Invalid cached transaction for wallet=${wallet} signature=${signature}`);
  return null;
}

export async function cacheWalletTransaction(wallet: string, tx: any, profileId: string) {
  await setCacheAtomic(`wallet-txs/${wallet}`, tx.signature, tx, profileId);
}

// Salva in parallelo le tx passate (già filtrate e riuscite)
export async function fetchAndCacheWalletTxs(walletPubkey: string, profileId: string, sinceMs: number, txs: any[] = []): Promise<any[]> {
  const normTxs = txs.map(normalizeRawTx);
  await Promise.all(txs.map(tx => setCache(`wallet-txs/${walletPubkey}`, tx.signature, tx, profileId)));
  return normTxs;
}
