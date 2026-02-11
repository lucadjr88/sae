export async function doubleCheckWallet(wallet: string, cutoffH: number, profileId: string) {
  const sinceMs = Date.now() - cutoffH * 3600 * 1000;
  const { getCache } = await import('./cache');
  let pick: any = null;
  try {
    pick = await (await import('./rpc/rpc-pool-manager.js')).RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
    const { connection, release } = pick;
    const { PublicKey } = await import('@solana/web3.js');
    const address = new PublicKey(wallet);
    const signatures = await connection.getSignaturesForAddress(address, { limit: 1000 });
    const filtered = signatures.filter(sig => sig.blockTime && sig.blockTime * 1000 >= sinceMs);
    const missing: string[] = [];
    for (const sig of filtered) {
      const tx = await getCache(`wallet-txs/${wallet}`, sig.signature, profileId);
      if (!tx) missing.push(sig.signature);
    }
    release({ success: true });
    if (missing.length === 0) {
      console.log(`[double-check] wallet=${wallet} tutte le signature hanno una tx salvata: OK`);
    } else {
      console.error(`[double-check] wallet=${wallet} signature mancanti:`, missing);
      const { fetchWalletTransactions } = await import('./solanaRpc');
      const { fetchAndCacheWalletTxs } = await import('./fetchAndCacheWalletTxs');
      const { txs: retriedTxs, failed: retriedFailed } = await fetchWalletTransactions(wallet, sinceMs, profileId, missing);
      await fetchAndCacheWalletTxs(wallet, profileId, sinceMs, retriedTxs);
      if (retriedFailed.length === 0) {
        console.log(`[double-check] wallet=${wallet} tutte le signature mancanti recuperate con successo!`);
      } else {
        console.error(`[double-check] wallet=${wallet} signature IRRIMEDIABILMENTE mancanti anche dopo retry:`, retriedFailed);
      }
    }
  } catch (err) {
    if (pick && pick.release) {
      try { pick.release({ success: false }); } catch {}
    }
    console.error(`[double-check] Errore durante doubleCheck per wallet=${wallet}:`, err);
  }
}

export default doubleCheckWallet;
