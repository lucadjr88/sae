import { Router } from 'express';
import { getWalletSageTransactions } from '../../examples/wallet-sage-transactions.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../../config/serverConfig.js';
import walletSageFeesStreamingRouter from './sage-fees-stream';

export default function walletRouter({ rpcPool, services }: any) {
  const r = Router();
  r.post('/sage-fees', async (req, res, next) => {
    const { walletPubkey, limit } = req.body;
    if (!walletPubkey) {
      return res.status(400).json({ error: 'walletPubkey required' });
    }
    try {
      // Qui puoi usare rpcPool o services se necessario
      const result = await getWalletSageTransactions(RPC_ENDPOINT, RPC_WEBSOCKET, walletPubkey, limit || 100);
      res.json(result);
    } catch (err: any) {
      next(err);
    }
  });
  r.use(walletSageFeesStreamingRouter({ services }));
  return r;
}
