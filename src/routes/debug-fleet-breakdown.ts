
import { Request, Response, Router } from 'express';
import { debugFleetBreakdown } from '../services/walletSageFeesStreaming/debug';
import { getGlobalRpcPoolManager } from '../utils/rpc/rpc-pool-manager.js';
import { globalRpcPoolAdapterWithFetch } from '../index.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const walletPubkey = body.walletPubkey;
    const opts = body;
    const services = {
      rpcPool: globalRpcPoolAdapterWithFetch,
      logger: console,
      metrics: undefined
    };
    const result = await debugFleetBreakdown(services, walletPubkey, opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
