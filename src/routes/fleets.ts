import { Request, Response } from 'express';
import { getFleets } from '../examples/getFleets-modular.js';
import { getCacheDataOnly, setCache } from '../utils/persist-cache.js';
import { nlog } from '../utils/log-normalizer.js';
import { scanFeePayerForRented } from '../utils/fee-payer-scan.js';
import { createRpcPoolManager } from '../utils/rpc/rpc-pool-manager.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { defaultServerConnection, globalPoolConnection } from '../index.js';
import { WALLET_PATH } from '../config/serverConfig.js';

export async function fleetsHandler(req: Request, res: Response) {
  const { profileId } = req.body;
  console.log(`[api/fleets] Received request at ${new Date().toISOString()} with body:`, { profileId });
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
    if (!refresh) {
      const cached = await getCacheDataOnly<any>('fleets', profileId);
      if (cached) {
        res.setHeader('X-Cache-Hit', 'disk');
        if (cached.walletAuthority == null) {
          console.log(`[api/fleets] Cache hit but walletAuthority missing for ${profileId}, forcing refresh`);
        } else {
          return res.json(cached);
        }
      }
    }
    let result = await getFleets(defaultServerConnection as any, globalPoolConnection as any, WALLET_PATH, profileId);
    // Include cached rented fleets
    try {
      const cachedRentedKeys = await getCacheDataOnly<string[]>('rented-fleets', profileId);
      if (cachedRentedKeys && Array.isArray(cachedRentedKeys)) {
        const existingKeys = new Set(result.fleets.map((f: any) => f.key));
        for (const key of cachedRentedKeys) {
          if (!existingKeys.has(key)) {
            const cachedFleet = await getCacheDataOnly<any>('fleets', key);
            if (cachedFleet && cachedFleet.isRented) {
              result.fleets.push(cachedFleet);
              existingKeys.add(key);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[api/fleets] Failed to load cached rented fleets:', e);
    }
    try {
      const walletAuthority = result.walletAuthority;
      const requestedFeePayer = req.body && req.body.feePayer ? String(req.body.feePayer) : null;
      const scanTarget = requestedFeePayer || walletAuthority;
      if (!scanTarget) {
        // nothing to scan
      } else if (requestedFeePayer && walletAuthority && requestedFeePayer === walletAuthority) {
        nlog(`[api/fleets] Requested feePayer equals derived walletAuthority (${walletAuthority}); skipping fee-payer scan`);
      } else {
        nlog(`[api/fleets] Scanning fee-payer transactions for ${scanTarget} to find rented fleets`);
        const localManager = createRpcPoolManager();
        try {
          const pool = localManager.getPoolLoader().getPool();
          for (const e of pool) {
            e.maxConcurrent = Math.min(e.maxConcurrent || 12, 8);
            e.backoffBaseMs = Math.max(e.backoffBaseMs || 1000, 1500);
          }
        } catch (e) {}
        try {
          const lhm: any = localManager.getHealthManager();
          if (typeof lhm.setBackoffBaseMs === 'function') lhm.setBackoffBaseMs(2000);
          if (typeof lhm.setCooldownMs === 'function') lhm.setCooldownMs(120000);
        } catch (e) {}
        const localPoolConnection = new RpcPoolConnection(defaultServerConnection, localManager);
        const scanTimeoutMs = Number(process.env.FEE_PAYER_SCAN_TIMEOUT_MS) || 60000;
        let scanRes: any = { rented: [], owned: [], all: [] };
        try {
          const scanPromise = scanFeePayerForRented(localPoolConnection, scanTarget, profileId, 1000);
          scanRes = await Promise.race([
            scanPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fee-payer scan timeout')), scanTimeoutMs))
          ]);
        } catch (e) {
          console.warn('[api/fleets] Fee-payer scan failed or timed out (non-fatal):', e && (e as any).message ? (e as any).message : e);
        }
        const existingKeys = new Set((result.fleets || []).map((f: any) => f.key));
        for (const rf of scanRes.rented) {
          if (!existingKeys.has(rf.key)) {
            const list = ((result as any).fleets = (result as any).fleets || []);
            list.push({
              callsign: rf.label,
              key: rf.key,
              data: {},
              isRented: true
            });
            existingKeys.add(rf.key);
          }
        }
        (result as any)._feePayerScan = {
          feePayer: scanTarget,
          rentedFound: scanRes.rented.map((r: any) => ({ key: r.key, label: r.label, owner: r.owner })),
          ownedFound: scanRes.owned.map((r: any) => ({ key: r.key, label: r.label }))
        };
      }
    } catch (e) {
      console.warn('[api/fleets] Fee-payer scan failed (non-fatal):', e && (e as any).message ? (e as any).message : e);
    }
    if (result && Array.isArray(result.fleets)) {
      // Filter out phantom fleets (no ships and unnamed)
      result.fleets = result.fleets.filter((f: any) => {
        const hasFleetShips = !!(f.data && typeof f.data.fleetShips === 'string' && f.data.fleetShips.length > 0);
        const hasValidCallsign = f.callsign && f.callsign !== '<unnamed>' && !f.callsign.startsWith('<unnamed');
        return hasFleetShips || hasValidCallsign;
      });

      for (const fleet of result.fleets) {
        if (fleet && fleet.key) {
          await setCache('fleets', fleet.key, fleet);
        }
      }
      // Cache list of rented fleet keys for this profile
      const rentedFleets = result.fleets.filter((f: any) => f.isRented).map((f: any) => f.key);
      await setCache('rented-fleets', profileId, rentedFleets);
    }
    res.json(result);
  } catch (err: any) {
    console.error('❌ /api/fleets error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
}

import { Router } from 'express';

const router = Router();

router.post('/', fleetsHandler);

export default router;