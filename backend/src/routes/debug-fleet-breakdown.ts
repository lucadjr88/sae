import { Request, Response } from 'express';
import { debugFleetBreakdown } from '../services/walletSageFeesStreaming/debug.js';
import type { WalletSageFeesStreamingServices } from '../services/walletSageFeesStreaming/types.js';
import { globalPoolConnection } from '../index.js';

export async function debugFleetBreakdownHandler(req: Request, res: Response): Promise<void> {
  try {
    const walletPubkey = req.body.walletPubkey;
    const opts = req.body || {};
    const services: WalletSageFeesStreamingServices = { rpcPool: globalPoolConnection as any, logger: console };
    const result = await debugFleetBreakdown(services, walletPubkey, opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
