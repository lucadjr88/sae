import { fetchAndCacheWalletTxs } from './fetchAndCacheWalletTxs';
import { fetchWalletTransactions } from './solanaRpc';

// Scarica e salva progressivamente tutte le tx delle ultime lats ore per un wallet
// Restituisce anche il totale signature tentate e quelle fallite
export async function getWalletTxsUtil(wallet: string, lats: number, profileId: string): Promise<{txs: any[], total: number, failed: string[]}> {
  const sinceMs = Date.now() - lats * 3600 * 1000;
  // fetchWalletTransactions ora ritorna solo le tx riuscite, ma logga le fallite
  // Per sapere le fallite, serve modificarla per restituire anche le signature fallite
  const { txs, total, failed } = await fetchWalletTransactions(wallet, sinceMs, profileId);
  // Salva solo le tx riuscite
  for (const tx of txs) {
    await fetchAndCacheWalletTxs(wallet, profileId, sinceMs, [tx]);
  }
  return { txs, total, failed };
}
