import { Router } from 'express';
import { getWalletSageFeesDetailedStreaming } from '../../services/walletSageFeesStreaming/index.js';

export default function walletSageFeesStreamingRouter({ services }: any) {
  const r = Router();
  r.post('/sage-fees-stream', async (req, res, next) => {
    try {
      const { walletPubkey, ...opts } = req.body;
      if (!walletPubkey) {
        return res.status(400).json({ error: 'walletPubkey required' });
      }
      // Passa tutto l'oggetto services e le opzioni
      const result = await getWalletSageFeesDetailedStreaming(services, walletPubkey, opts);
      res.json(result);
    } catch (err) { next(err); }
  });
  return r;
}
