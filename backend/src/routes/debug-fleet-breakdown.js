import { Request, Response } from 'express';
import { debugFleetBreakdown } from '../services/walletSageFeesStreaming/debug';
import { getWalletSageFeesStreamingServices } from '../services/walletSageFeesStreaming/types';
import { ensureProfileCacheDir } from '../utils/persist-cache.js';

export async function debugFleetBreakdownHandler(req: Request, res: Response): Promise<void> {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ error: 'profileId required' });
    }
    // Ensure profile cache directory exists immediately after validation
    await ensureProfileCacheDir(profileId);
    const opts = req.body || {};
    const services = getWalletSageFeesStreamingServices();
    const result = await debugFleetBreakdown(services, profileId, opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
