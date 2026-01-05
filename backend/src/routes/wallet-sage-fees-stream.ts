import { Request, Response } from 'express';
import crypto from 'crypto';
import { getCacheWithTimestamp, setCache, ensureProfileCacheDir } from '../utils/persist-cache.js';
import { nlog } from '../utils/log-normalizer.js';
import { getWalletSageFeesDetailedStreaming } from '../services/walletSageFeesStreaming/index.js';
import { RpcPoolAdapter } from '../services/RpcPoolAdapter.js';

export async function walletSageFeesStreamHandler(req: Request, res: Response) {
  const { profileId, fleetAccounts, fleetNames, fleetRentalStatus, hours, debug, enableSubAccountMapping } = req.body;
  console.log(`[api/wallet-sage-fees-stream] Received request at ${new Date().toISOString()} with profileId=${profileId ? profileId.substring(0,8) : 'undefined'}`);
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  // Ensure profile cache directory exists immediately after validation
  await ensureProfileCacheDir(profileId);

  const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
  const update = (req.query.update === 'true') || (req.body && req.body.update === true);
  // Modalità debug: se ?debug=json o body.debug=true, rispondi con JSON puro
  const debugJson = req.query.debug === 'json' || debug === true;
  const keyPayload = JSON.stringify({ a: fleetAccounts || [], n: fleetNames || {}, r: fleetRentalStatus || {}, h: hours || 24, s: !!enableSubAccountMapping });
  const compositeKey = `${profileId}__${keyPayload}`;
  const cacheKey = crypto.createHash('sha256').update(compositeKey).digest('hex');
  console.log(`[stream] Cache key hash: ${cacheKey.substring(0, 16)}...`);
  console.log(`[stream] Request for profile ${profileId.substring(0, 8)}... refresh=${refresh}, update=${update}`);

  if (update) {
    const cached = await getCacheWithTimestamp<any>(profileId, 'wallet-fees-detailed', cacheKey);
    if (cached) {
      const cacheAgeMs = Date.now() - cached.savedAt;
      const sixHoursMs = 6 * 60 * 60 * 1000;
      if (cacheAgeMs < sixHoursMs) {
        console.log(`[stream] Update mode: cache is fresh (${(cacheAgeMs / 60000).toFixed(1)}min), serving cached while recomputing full dataset`);
      } else {
        console.log(`[stream] Update mode: cache too old (${(cacheAgeMs / 3600000).toFixed(1)}h), doing full refresh`);
      }
    } else {
      console.log(`[stream] Update mode: no cache found, doing full fetch`);
    }
  }

  if (!refresh && !update) {
    const cached = await getCacheWithTimestamp<any>(profileId, 'wallet-fees-detailed', cacheKey);
    if (cached) {
      const cacheAgeMs = Date.now() - cached.savedAt;
      const cacheAgeMin = (cacheAgeMs / 60000).toFixed(1);
      console.log(`[stream] ✅ Cache HIT! Age: ${cacheAgeMin} minutes`);
      if (debugJson) {
        res.setHeader('Content-Type', 'application/json');
        res.json({ type: 'complete', ...cached.data, fromCache: true });
        return;
      } else {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Cache-Hit', 'disk');
        res.setHeader('X-Cache-Timestamp', String(cached.savedAt));
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ type: 'complete', ...cached.data, fromCache: true })}\n\n`);
        res.end();
        return;
      }
    } else {
      console.log(`[stream] ❌ Cache MISS - processing fresh data`);
    }
  } else if (refresh) {
    console.log(`[stream] Refresh requested - bypassing cache`);
  }

  if (!debugJson) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  let lastResult: any = null;
  const sendUpdate = (data: any) => {
    try {
      nlog(`[stream] -> sendUpdate type=${data.type || 'unknown'} stage=${data.stage || ''} processed=${data.processed || ''}`);
      if (debugJson) {
        lastResult = data;
      } else {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    } catch (e) {
      console.error('[stream] Failed to write SSE chunk', e);
    }
  };

  try {
    const rpcPool = new RpcPoolAdapter();
    const services = { rpcPool, logger: console } as any;

    // Send minimal progress notification
    if (!debugJson) {
      sendUpdate({ type: 'progress', stage: 'transactions', processed: 0, total: 0 });
    }

    const finalResult = await getWalletSageFeesDetailedStreaming(services, profileId, {
      fleetAccounts: fleetAccounts || [],
      fleetNames: fleetNames || {},
      fleetRentalStatus: fleetRentalStatus || {},
      enableSubAccountMapping: !!enableSubAccountMapping,
      hours: hours || 24,
      limit: 3000,
    });

    const payload = { type: 'complete', ...finalResult, fromCache: false };

    console.log(`[stream] 💾 Saving to cache for wallet ${profileId.substring(0, 8)}...`);
    try {
      await setCache(profileId, 'wallet-fees-detailed', cacheKey, payload);
      console.log(`[stream] ✅ Cache saved successfully`);
    } catch (err) {
      console.error('[stream] Failed to save cache:', err);
    }

    if (debugJson) {
      res.setHeader('Content-Type', 'application/json');
      res.json(payload);
    } else {
      sendUpdate(payload);
      res.end();
    }
  } catch (err: any) {
    console.error('❌ /api/wallet-sage-fees-stream error:', err.message);
    if (debugJson) {
      res.status(500).json({ error: err.message });
    } else {
      sendUpdate({ error: err.message });
      res.end();
    }
  }
}
