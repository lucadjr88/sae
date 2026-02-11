import express from 'express';
import { getWalletTxsUtil } from '../../utils/getWalletTxs';
import { getWalletAuthorityUtil } from '../../utils/getWalletAuthority';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager';

const router = express.Router();

// GET /api/debug/get-wallet-txs?profileId=...&cutoffH=...
router.get('/get-wallet-txs', async (req, res) => {
  try {
    const profileId = req.query.profileId as string;
    const cutoffH = parseInt(req.query.cutoffH as string) || 24;
    if (!profileId) return res.status(400).json({ error: 'Missing profileId' });

    // 1. Recupera allowed wallets
    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    if (!allowedWallets || allowedWallets.length === 0) {
      return res.status(404).json({ error: 'No allowed wallets found' });
    }

    // 2. Per ogni wallet, scarica tx usando connessione da RpcPoolManager
    const sinceMs = Date.now() - cutoffH * 3600 * 1000;
    const results = [];
    for (const w of allowedWallets) {
      console.log(`[get-wallet-txs] profileId=${profileId} wallet=${w.pubkey} cutoffH=${cutoffH}`);
      const { connection, release } = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
      try {
        const result = await getWalletTxsUtil(w.pubkey, cutoffH, connection);
        const txCount = result.txs?.length || 0;
        console.log(`[get-wallet-txs] wallet=${w.pubkey} txCount=${txCount}`);
        results.push({ wallet: w.pubkey, txCount });
      } finally {
        release({ success: true });
      }
    }
    res.json({ profileId, cutoffH, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
