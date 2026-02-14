import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { orchestrateFleetsForProfile } from './fleetOrchestrator';
import { setCache, getCache } from '../utils/cache';
import buildFeesDetailed from '../utils/buildFeesDetailed';
import { getWalletAuthorityUtil } from '../utils/getWalletAuthority';
import { getWalletTxsUtil } from '../utils/getWalletTxs';

const router = Router();

async function clearNamespaces(profileId: string) {
    const toClear = ['sage-ops', 'unknown', 'fleet-breakdowns', 'player-ops', 'reports', 'playload'];
    for (const ns of toClear) {
        const dir = path.join(process.cwd(), 'cache', profileId, ns);
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch (e) {
            // ignore
        }
    }
}


// Importa i 7 handler debug
import { getWalletAuthorityHandler } from './debug/getWalletAuthority';
import { getWalletTxsHandler } from './debug/getWalletTxs';
import { decodeSageOpsFullHandler } from './debug/decodeSageOpsFull';
import { getFleetsHandler } from './debug/getFleets';
import { getRentedFleetsHandler } from './debug/getRentedFleets';
import { associateSageOpsToFleetsHandler } from './debug/associateSageOpsToFleets';
import playloadHandler from './debug/playload';
import { resetPoolCache } from '../utils/rpc/rpc-pool-manager';
import { resetHealthMap } from '../utils/rpc/health-manager';
import { resetConcurrencyMap } from '../utils/rpc/concurrency-manager';
import { resetMetricsMap } from '../utils/rpc/metrics';


router.post('/analyze-profile', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { profileId, wipeCache, lats, cachePersist } = req.body || {};
    console.log(`[/api/analyze-profile] POST request received | profileId=${profileId} | wipeCache=${wipeCache} | lats=${lats} | cachePersist=${cachePersist}`);
    
    if (!profileId || typeof profileId !== 'string') {
      console.log(`[/api/analyze-profile] ❌ Invalid profileId | profileId=${profileId}`);
      return res.status(400).json({ error: 'Missing profileId' });
    }
    
    try {
        // If wipeCache is requested, delete entire profile cache directory
        if (wipeCache) {
            try {
                const profileCacheDir = path.join(process.cwd(), 'cache', profileId);
                await fs.rm(profileCacheDir, { recursive: true, force: true });

                console.log(`[analyze-profile] Wiped entire cache for profile: ${profileId}`);
            } catch (wipeErr) {
                console.error('[analyze-profile] Failed to wipe cache:', wipeErr);
            }
        }

        // Check if playload already exists in cache (unless wipeCache is requested)
        if (!wipeCache) {
            try {
                const cachedPlayload = await getCache('playload', 'latest', profileId);
                if (cachedPlayload && cachedPlayload.data) {
                    console.log('[analyze-profile] Serving cached playload');
                    if (cachedPlayload.savedAt) {
                        res.set('X-Cache-Hit', 'disk');
                        res.set('X-Cache-Timestamp', String(cachedPlayload.savedAt));
                    }
                    return res.json(cachedPlayload.data);
                }
            } catch (cacheErr) {
                console.log('[analyze-profile] No cached playload found, proceeding with analysis');
            }
        }

        resetPoolCache(profileId);
        resetHealthMap();
        resetConcurrencyMap();
        resetMetricsMap();

        // FASE 1: GET WALLET AUTHORITY
        console.log("###################### INIZIO FASE 1: GET WALLET AUTHORITY #########################");
        const req1: any = { query: { profileId } };
        const res1: any = { json: (data: any) => data, status: () => res1, send: () => { } };
        const walletAuthority = await getWalletAuthorityHandler(req1, res1);
        console.log("###################### FINE FASE 1, INIZIO FASE 2: GET WALLET TXS #########################");

        // FASE 2: GET WALLET TXS
        const req2: any = { query: { profileId, cutoffH: lats || 24 } };
        const res2: any = { json: (data: any) => data, status: () => res2, send: () => { } };
        const walletTxs = await getWalletTxsHandler(req2, res2);
        console.log("###################### FINE FASE 2, INIZIO FASE 3: DECODE SAGE OPS #########################");

        // FASE 3: DECODE SAGE OPS
        const req3: any = { query: { profileId } };
        const res3: any = { json: (data: any) => data, status: () => res3, send: () => { } };
        const sageOps = await decodeSageOpsFullHandler(req3, res3);
        console.log("###################### FINE FASE 3, INIZIO FASE 4: GET FLEETS #########################");

        // FASE 4: GET FLEETS
        const req4: any = { query: { profileId } };
        const res4: any = { json: (data: any) => data, status: () => res4, send: () => { } };
        const fleets = await getFleetsHandler(req4, res4);
        console.log("###################### FINE FASE 4, INIZIO FASE 5: GET RENTED FLEETS #########################");

        // FASE 5: GET RENTED FLEETS
        const req5: any = { query: { profileId } };
        const res5: any = { json: (data: any) => data, status: () => res5, send: () => { } };
        const rentedFleets = await getRentedFleetsHandler(req5, res5);
        console.log("###################### FINE FASE 5, INIZIO FASE 6: ASSOCIATE SAGE OPS TO FLEETS #########################");

        // FASE 6: ASSOCIATE SAGE OPS TO FLEETS
        const req6: any = { query: { profileId } };
        const res6: any = { json: (data: any) => data, status: () => res6, send: () => { } };
        const breakdown = await associateSageOpsToFleetsHandler(req6, res6);
        console.log("###################### FINE FASE 6, INIZIO FASE 7: PLAYLOAD #########################");

        // FASE 7: PLAYLOAD (aggregazione finale, identica a GET /api/debug/playload)
        const req7: any = { query: { profileId, wipeCache } };
        const res7: any = { json: (data: any) => data, status: () => res7, send: () => { } };
        const playload = await playloadHandler(req7, res7);
        // Ensure frontend receives the aggregated fees/breakdown used for displays
        try {
            const fees = await buildFeesDetailed(profileId as string);
            // Merge fee details into returned playload to match frontend expectations
            const merged = Object.assign({}, playload || {}, {
                feesByFleet: fees.feesByFleet,
                feesByOperation: fees.feesByOperation,
                sageFees24h: fees.sageFees24h,
                totalSignaturesFetched: fees.totalSignaturesFetched,
                transactionCount24h: fees.transactionCount24h,
                fromCache: fees.fromCache,
                firstTxTime: fees.firstTxTime,
                breakdown: { feesByFleet: fees.feesByFleet }
            });

            // Save EXACTLY what we send to frontend
            try {
                await setCache('playload', 'latest', merged, profileId as string);
            } catch (saveErr) {
                console.error('[analyze-profile] failed to save playload cache', saveErr);
            }

            // Clean up all cache except playload/latest.json (unless cachePersist is true)
            if (!cachePersist) {
                try {
                    const cacheDir = path.join(process.cwd(), 'cache', profileId as string);
                    const playloadFile = path.join(cacheDir, 'playload', 'latest.json');

                    // Get all subdirectories in cache
                    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(cacheDir, entry.name);
                        if (entry.isDirectory()) {
                            if (entry.name === 'playload') {
                                // Keep only latest.json in playload folder
                                const playloadFiles = await fs.readdir(fullPath);
                                for (const file of playloadFiles) {
                                    if (file !== 'latest.json') {
                                        await fs.rm(path.join(fullPath, file), { recursive: true, force: true });
                                    }
                                }
                            } else {
                                // Remove all other directories
                                await fs.rm(fullPath, { recursive: true, force: true });
                            }
                        } else if (entry.name !== playloadFile) {
                            // Remove any files in the root cache directory
                            await fs.rm(fullPath, { force: true });
                        }
                    }
                    console.log('[analyze-profile] Cache cleaned, kept only playload/latest.json');
                } catch (cleanErr) {
                    console.error('[analyze-profile] failed to clean cache', cleanErr);
                }
            }

            console.log("###################### FINE FASE 7: FINE FLUSSO ANALYZE #########################");
            res.set('X-Cache-Hit', 'miss');
            res.set('X-Cache-Timestamp', String(Date.now()));
            return res.json(merged);
        } catch (e) {
            console.error('[analyze-profile] buildFeesDetailed failed', e);

            // Save fallback playload
            try {
                await setCache('playload', 'latest', playload, profileId as string);
            } catch (saveErr) {
                console.error('[analyze-profile] failed to save fallback playload cache', saveErr);
            }

            // Clean up all cache except playload/latest.json (unless cachePersist is true)
            if (!cachePersist) {
                try {
                    const cacheDir = path.join(process.cwd(), 'cache', profileId as string);
                    const playloadFile = path.join(cacheDir, 'playload', 'latest.json');

                    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(cacheDir, entry.name);
                        if (entry.isDirectory()) {
                            if (entry.name === 'playload') {
                                const playloadFiles = await fs.readdir(fullPath);
                                for (const file of playloadFiles) {
                                    if (file !== 'latest.json') {
                                        await fs.rm(path.join(fullPath, file), { recursive: true, force: true });
                                    }
                                }
                            } else {
                                await fs.rm(fullPath, { recursive: true, force: true });
                            }
                        } else if (entry.name !== playloadFile) {
                            await fs.rm(fullPath, { force: true });
                        }
                    }
                    console.log('[analyze-profile] Cache cleaned, kept only playload/latest.json');
                } catch (cleanErr) {
                    console.error('[analyze-profile] failed to clean cache', cleanErr);
                }
            }

            console.log("###################### FINE FASE 7: FINE FLUSSO ANALYZE #########################");
            res.set('X-Cache-Hit', 'miss');
            res.set('X-Cache-Timestamp', String(Date.now()));
            const duration = Date.now() - startTime;
            console.log(`[/api/analyze-profile] ✅ SUCCESS | profileId=${profileId} | duration=${duration}ms`);
            return res.json(playload);
        }
    } catch (e: any) {
        const duration = Date.now() - startTime;
        console.error(`[/api/analyze-profile] ❌ ERROR | profileId=${profileId} | error=${e?.message || e} | duration=${duration}ms`);
        return res.status(500).json({ error: e?.message || 'analyze-profile failed' });
    }
});

export default router;
