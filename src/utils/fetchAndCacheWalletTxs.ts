// Fetch e cache delle transazioni raw per un wallet
// (mock: da implementare fetch reale via RPC)

import { setCache } from './cache.js';
import { normalizeRawTx } from './normalizeRawTx.js';

// Salva in parallelo le tx passate (già filtrate e riuscite)
export async function fetchAndCacheWalletTxs(walletPubkey: string, profileId: string, sinceMs: number, txs: any[] = []): Promise<any[]> {
  const normTxs = txs.map(normalizeRawTx);
  await Promise.all(txs.map(tx => setCache(`wallet-txs/${walletPubkey}`, tx.signature, tx, profileId)));
  return normTxs;
}
