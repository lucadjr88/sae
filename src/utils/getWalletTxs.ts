import { fetchAndCacheWalletTxs } from './fetchAndCacheWalletTxs.js';
import { fetchWalletTransactions } from './solanaRpc.js';

// Scarica e salva progressivamente tutte le tx delle ultime lats ore per un wallet
// Restituisce anche il totale signature tentate e quelle fallite
export async function getWalletTxsUtil(wallet: string, lats: number, profileId: string): Promise<{txs: any[], total: number, failed: string[]}> {
  const sinceMs = Date.now() - lats * 3600 * 1000;
  const { txs, total, failed } = await fetchWalletTransactions(wallet, sinceMs, profileId);
  // Salva tutte le tx in parallelo invece di attenderle una per una
  await fetchAndCacheWalletTxs(wallet, profileId, sinceMs, txs);
  return { txs, total, failed };
}
