import { Request, Response } from 'express';
import { debugFleetBreakdown } from '../services/walletSageFeesStreaming/debug.js';
import type { WalletSageFeesStreamingServices } from '../services/walletSageFeesStreaming/types.js';
import { globalPoolConnection } from '../index.js';
import { ensureProfileCacheDir } from '../utils/persist-cache.js';

export async function debugFleetBreakdownHandler(req: Request, res: Response): Promise<void> {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      res.status(400).json({ error: 'profileId required' });
      return;
    }
    // Ensure profile cache directory exists immediately after validation
    await ensureProfileCacheDir(profileId);
    const opts = req.body || {};
    const services: WalletSageFeesStreamingServices = { rpcPool: globalPoolConnection as any, logger: console };
    const result = await debugFleetBreakdown(services, profileId, opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
