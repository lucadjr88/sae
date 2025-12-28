import { getAccountTransactions } from '../examples/account-transactions.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../config/serverConfig.js';

/**
 * Scarica e salva in cache tutte le transazioni delle ultime 24h per un wallet
 * @param walletPubkey string
 * @returns Promise<void>
 */
export async function cacheWalletTransactions24h(walletPubkey: string): Promise<void> {
  const sinceUnixMs = Date.now() - 24 * 60 * 60 * 1000;
  try {
    await getAccountTransactions(
      RPC_ENDPOINT,
      RPC_WEBSOCKET,
      walletPubkey,
      5000, // limite alto per coprire 24h
      sinceUnixMs,
      10000,
      { refresh: true }
    );
    // Le transazioni vengono già salvate in cache da getAccountTransactions
    console.log(`[cacheWalletTransactions24h] Cache aggiornata per ${walletPubkey}`);
  } catch (err: any) {
    console.error(`[cacheWalletTransactions24h] Errore durante il fetch/cache delle tx:`, err.message);
  }
}
