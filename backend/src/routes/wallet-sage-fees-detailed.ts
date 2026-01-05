import { Request, Response } from 'express';
import crypto from 'crypto';
import { getCacheWithTimestamp, setCache, ensureProfileCacheDir } from '../utils/persist-cache.js';
import { getWalletSageFeesDetailed } from '../services/wallet/feesDetailed.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { defaultServerConnection, globalPoolConnection } from '../index.js';

/**
 * Detailed 24h SAGE fees with fleet breakdown (legacy non-streaming)
 */
export async function walletSageFeesDetailedHandler(req: Request, res: Response) {
  const { profileId, fleetAccounts, fleetNames, fleetRentalStatus, hours } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  // Ensure profile cache directory exists immediately after validation
  await ensureProfileCacheDir(profileId);
  try {
    const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
    const keyPayload = JSON.stringify({ a: fleetAccounts || [], n: fleetNames || {}, r: fleetRentalStatus || {}, h: hours || 24 });
    const compositeKey = `${profileId}__${keyPayload}`;
    const cacheKey = crypto.createHash('sha256').update(compositeKey).digest('hex');
    if (!refresh) {
      const cached = await getCacheWithTimestamp<any>(profileId, 'wallet-fees-detailed', cacheKey);
      if (cached) {
        res.setHeader('X-Cache-Hit', 'disk');
        res.setHeader('X-Cache-Timestamp', String(cached.savedAt));
        return res.json(cached.data);
      }
    }
    const result = await getWalletSageFeesDetailed(
      RPC_ENDPOINT,
      RPC_WEBSOCKET,
      profileId,
      fleetAccounts || [],
      fleetNames || {},
      fleetRentalStatus || {},
      hours || 24,
      { refresh },
      globalPoolConnection
    );
    await setCache(profileId, 'wallet-fees-detailed', cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('❌ /api/wallet-sage-fees-detailed error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
}

import { Router } from 'express';

const router = Router();

router.post('/', walletSageFeesDetailedHandler);

export default router;