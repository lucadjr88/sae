import { fetchWalletTransactions } from './solanaRpc.js';

// Scarica e salva progressivamente tutte le tx delle ultime lats ore per un wallet
// Restituisce anche il totale signature tentate e quelle fallite
export async function getWalletTxsUtil(wallet: string, lats: number, profileId: string): Promise<{txs: any[], total: number, failed: string[]}> {
  const sinceMs = Date.now() - lats * 3600 * 1000;
  const { txs, total, failed } = await fetchWalletTransactions(wallet, sinceMs, profileId, undefined, true);
  return { txs, total, failed };
}
