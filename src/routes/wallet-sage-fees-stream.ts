import { Request, Response } from 'express';
import crypto from 'crypto';
import { getCacheWithTimestamp, setCache } from '../utils/persist-cache.js';
import { nlog } from '../utils/log-normalizer.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../config/serverConfig.js';

export async function walletSageFeesStreamHandler(req: Request, res: Response) {
  const { walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus, hours, debug } = req.body;
  console.log(`[api/wallet-sage-fees-stream] Received request at ${new Date().toISOString()} with walletPubkey=${walletPubkey ? walletPubkey.substring(0,8) : 'undefined'}`);
  if (!walletPubkey) {
    return res.status(400).json({ error: 'walletPubkey required' });
  }

  const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
  const update = (req.query.update === 'true') || (req.body && req.body.update === true);
  // Modalità debug: se ?debug=json o body.debug=true, rispondi con JSON puro
  const debugJson = req.query.debug === 'json' || debug === true;
  const keyPayload = JSON.stringify({ a: fleetAccounts || [], n: fleetNames || {}, r: fleetRentalStatus || {}, h: hours || 24 });
  const compositeKey = `${walletPubkey}__${keyPayload}`;
  const cacheKey = crypto.createHash('sha256').update(compositeKey).digest('hex');
  console.log(`[stream] Cache key hash: ${cacheKey.substring(0, 16)}...`);
  console.log(`[stream] Request for wallet ${walletPubkey.substring(0, 8)}... refresh=${refresh}, update=${update}`);

  let cachedData = null;
  let lastProcessedSignature = null;
  if (update) {
    const cached = await getCacheWithTimestamp<any>('wallet-fees-detailed', cacheKey);
    if (cached) {
      const cacheAgeMs = Date.now() - cached.savedAt;
      const { getWalletSageFeesDetailedStreaming } = await import('../examples/wallet-sage-fees-streaming.js');
      const sixHoursMs = 6 * 60 * 60 * 1000;
      if (cacheAgeMs < sixHoursMs) {
        console.log(`[stream] Update mode: cache is fresh (${(cacheAgeMs / 60000).toFixed(1)}min), will fetch only new transactions`);
        cachedData = cached.data;
        if (cachedData.allTransactions && cachedData.allTransactions.length > 0) {
          lastProcessedSignature = cachedData.allTransactions[0].signature;
          console.log(`[stream] Last processed signature: ${lastProcessedSignature.substring(0, 8)}...`);
        } else {
          console.log('[stream] Legacy cache detected (missing allTransactions). Performing full fetch this time to upgrade format.');
        }
      } else {
        console.log(`[stream] Update mode: cache too old (${(cacheAgeMs / 3600000).toFixed(1)}h), doing full refresh`);
      }
    } else {
      console.log(`[stream] Update mode: no cache found, doing full fetch`);
    }
  }

  if (!refresh && !update) {
    const cached = await getCacheWithTimestamp<any>('wallet-fees-detailed', cacheKey);
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

  const saveProgress = async (partialResult: any) => {
    try {
      await setCache('wallet-fees-detailed', cacheKey, partialResult);
      nlog(`[stream] 📦 Incremental cache saved (${partialResult.transactionCount24h || 0} tx processed)`);
    } catch (err) {
      console.error('[stream] Failed to save incremental cache:', err);
    }
  };

  try {
    const { getWalletSageFeesDetailedStreaming } = await import('../examples/wallet-sage-fees-streaming.js');
    const finalResult = await getWalletSageFeesDetailedStreaming(
      RPC_ENDPOINT,
      RPC_WEBSOCKET,
      walletPubkey,
      fleetAccounts || [],
      fleetNames || {},
      fleetRentalStatus || {},
      hours || 24,
      sendUpdate,
      saveProgress,
      cachedData,
      lastProcessedSignature,
      refresh
    );
    console.log(`[stream] 💾 Saving to cache for wallet ${walletPubkey.substring(0, 8)}...`);
    if (finalResult.totalSignaturesFetched > 0) {
      await setCache('wallet-fees-detailed', cacheKey, finalResult);
      console.log(`[stream] ✅ Cache saved successfully`);
    } else {
      console.log(`[stream] ❌ Not saving cache (0 signatures fetched, likely rate limited)`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    if (debugJson && lastResult) {
      res.setHeader('Content-Type', 'application/json');
      res.json(lastResult);
    } else {
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
