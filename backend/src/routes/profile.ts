import { Request, Response } from 'express';
import { getPlayerProfile } from '../services/profile/getProfile.js';
import { getCacheDataOnly, setCache, ensureProfileCacheDir } from '../utils/persist-cache.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';

/**
 * API: 02 - Player Profile
 */
export async function profileHandler(req: Request, res: Response) {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  // Ensure profile cache directory exists immediately after validation
  await ensureProfileCacheDir(profileId);
  try {
    const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
    if (!refresh) {
      const cached = await getCacheDataOnly<any>(profileId, 'profile', profileId);
      if (cached) {
        res.setHeader('X-Cache-Hit', 'disk');
        return res.json(cached);
      }
    }
    const result = await getPlayerProfile(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
    await setCache(profileId, 'profile', profileId, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}