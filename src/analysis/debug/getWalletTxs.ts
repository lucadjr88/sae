
import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getWalletAuthorityUtil } from '../../utils/getWalletAuthority';
import { getWalletTxsUtil } from '../../utils/getWalletTxs';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager';

// GET /api/debug/get-wallet-txs?profileId=...&cutoffH=...
export async function getWalletTxsHandler(req: Request, res: Response) {
      // Funzione di double-check: dopo la prima fetch, esegue prune pool, rifà getSignaturesForAddress e controlla la presenza delle tx in cache
      async function doubleCheckWallet(wallet: string, cutoffH: number, profileId: string) {
        const sinceMs = Date.now() - cutoffH * 3600 * 1000;
        // Force refresh pool for double-check (keeps original behaviour)
        await RpcPoolManager.ensurePool(profileId, true);
        // Ricarica pool aggiornata e usa RpcPoolManager per la connessione
        const { getCache } = await import("../../utils/cache");
        let pick: any = null;
        try {
          pick = await (await import("../../utils/rpc/rpc-pool-manager.js")).RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
          const { connection, release } = pick;
          const { PublicKey } = await import("@solana/web3.js");
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
            // Retry automatico: rilancio getWalletTxsUtil solo per le signature mancanti
            const { fetchWalletTransactions } = await import("../../utils/solanaRpc");
            const { fetchAndCacheWalletTxs } = await import("../../utils/fetchAndCacheWalletTxs");
            // Scarica solo le tx mancanti
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
  const profileId = req.query.profileId as string;
  const cutoffH = req.query.cutoffH ? Number(req.query.cutoffH) : 24;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    // Ensure RPC pool is ready. Use unified RpcPoolManager.ensurePool to avoid duplicate prune.
    try {
      await RpcPoolManager.ensurePool(profileId, false);
    } catch (e) {
      console.warn('[get-wallet-txs] ensurePool failed:', e?.message || e);
    }
    // Recupera allowed wallets dal profilo
    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    if (!allowedWallets || allowedWallets.length === 0) {
      return res.status(404).json({ error: 'No allowed wallets found' });
    }
    // Deduplica i wallet per pubkey
    const seen = new Set<string>();
    const results = [];
    for (const w of allowedWallets) {
      if (seen.has(w.pubkey)) continue;
      seen.add(w.pubkey);
      console.log(`[get-wallet-txs] profileId=${profileId} wallet=${w.pubkey} cutoffH=${cutoffH}`);
      // getWalletTxsUtil ora restituisce anche il totale signature tentate e fallite
      let txs = [];
      let total = 0;
      let failed = [];
      try {
        const result = await getWalletTxsUtil(w.pubkey, cutoffH, profileId);
        txs = result.txs || [];
        total = result.total || 0;
        failed = result.failed || [];
      } catch (e) {
        console.error(`[get-wallet-txs] Errore getWalletTxsUtil per wallet=${w.pubkey}:`, e);
      }
      console.log(`[get-wallet-txs] wallet=${w.pubkey} tx riuscite=${txs.length}/${total} (fallite=${failed.length})`);
      if (txs.length > 0) {
        console.log(`[get-wallet-txs] Salvate ${txs.length} tx in cache/wallet-txs/${w.pubkey}/`);
      }
      if (failed.length > 0) {
        console.log(`[get-wallet-txs] signature fallite dopo max retry:`, failed);
      }
      results.push({ wallet: w.pubkey, txCount: txs.length });
      // Double-check dopo prune pool aggiornata (shared util)
      try {
        const { doubleCheckWallet } = await import('../../utils/doubleCheckWallet');
        await doubleCheckWallet(w.pubkey, cutoffH, profileId);
      } catch (e) {
        console.error('[get-wallet-txs] doubleCheckWallet failed', e);
      }
    }
    return res.json({ profileId, cutoffH, results });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'getWalletTxs failed' });
  }
}
