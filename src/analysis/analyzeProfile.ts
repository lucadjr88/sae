import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { orchestrateFleetsForProfile } from './fleetOrchestrator.js';
import { setCache, getCache } from '../utils/cache.js';
import buildFeesDetailed from '../utils/buildFeesDetailed.js';
import { decodeResources } from '../utils/resources_analyses.js';
import { deriveStarbaseCargoIdsForProfile } from '../utils/deriveStarbaseCargoIdsForProfile.js';
import { getWalletAuthorityUtil } from '../utils/getWalletAuthority.js';
import { getWalletTxsUtil } from '../utils/getWalletTxs.js';
import { getProfileFactionUtil } from '../utils/getProfileFaction.js';

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

function isUsableCachedPlayload(payloadData: any) {
    if (!payloadData || typeof payloadData !== 'object') return false;
    return !(
        Object.keys(payloadData.feesByFleet || {}).length === 0
        && Number(payloadData.transactionCount24h || 0) === 0
        && Number(payloadData.sageFees24h || 0) === 0
    );
}

// Importa i 7 handler debug
import { getWalletAuthorityHandler } from './debug/getWalletAuthority.js';
import { getWalletTxsHandler } from './debug/getWalletTxs.js';
import { decodeSageOpsFullHandler } from './debug/decodeSageOpsFull.js';
import { associateSageOpsToFleetsHandler } from './debug/associateSageOpsToFleets.js';
import playloadHandler from './debug/playload.js';
import { fetchProfileFleets } from '../utils/fetchProfileFleets.js';
import { fetchProfileRentedFleets } from '../utils/fetchProfileRentedFleets.js';
import { resetPoolCache } from '../utils/rpc/rpc-pool-manager.js';
import { resetHealthMap } from '../utils/rpc/health-manager.js';
import { resetConcurrencyMap } from '../utils/rpc/concurrency-manager.js';
import { resetMetricsMap } from '../utils/rpc/metrics.js';
import { waitForProfileAnalysisLock } from '../utils/profile-analysis-lock.js';


router.post('/analyze-profile', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { profileId, wipeCache, lats, cachePersist } = req.body || {};
    console.log(`[/api/analyze-profile] POST request received | profileId=${profileId} | wipeCache=${wipeCache} | lats=${lats} | cachePersist=${cachePersist}`);
    
    if (!profileId || typeof profileId !== 'string') {
      console.log(`[/api/analyze-profile] ❌ Invalid profileId | profileId=${profileId}`);
      return res.status(400).json({ error: 'Missing profileId' });
    }

    let releaseAnalysisLock: (() => Promise<void>) | null = null;

    try {
        // Check if playload already exists in cache (unless wipeCache is requested)
        if (!wipeCache) {
            try {
                const cachedPlayload = await getCache('playload', 'latest', profileId);
                if (cachedPlayload && cachedPlayload.data) {
                    let payloadData = cachedPlayload.data;

                    const factionMissing = typeof payloadData.profileFaction === 'undefined'
                        && typeof payloadData.profileFactionId === 'undefined'
                        && typeof payloadData.profileFactionAccount === 'undefined';

                    if (factionMissing) {
                        try {
                            console.log('[analyze-profile] Cached playload missing profileFaction, rebuilding profile meta');
                            const profileFactionInfo = await getProfileFactionUtil(profileId as string);
                            payloadData = Object.assign({}, payloadData, profileFactionInfo);
                            await setCache('playload', 'latest', payloadData, profileId as string);
                        } catch (profileFactionCacheHitErr) {
                            console.warn('[analyze-profile] Failed rebuilding profileFaction on cache hit', profileFactionCacheHitErr);
                        }
                    }

                    const feeSnapshotMissing = !Array.isArray(payloadData.hourlyFees24h)
                        || payloadData.hourlyFees24h.length !== 24
                        || typeof payloadData.sageFees24h !== 'number'
                        || typeof payloadData.transactionCount24h !== 'number'
                        || !Object.prototype.hasOwnProperty.call(payloadData, 'firstTxTime')
                        || !Object.prototype.hasOwnProperty.call(payloadData, 'lastTxTime');

                    if (feeSnapshotMissing) {
                        try {
                            console.log('[analyze-profile] Cached playload missing fee snapshot, rebuilding fee summary');
                            const fees = await buildFeesDetailed(profileId as string);
                            payloadData = Object.assign({}, payloadData, {
                                feesByFleet: fees.feesByFleet,
                                feesByOperation: fees.feesByOperation,
                                sageFees24h: fees.sageFees24h,
                                hourlyFees24h: fees.hourlyFees24h,
                                totalSignaturesFetched: fees.totalSignaturesFetched,
                                transactionCount24h: fees.transactionCount24h,
                                unknownOperations: fees.unknownOperations,
                                fromCache: fees.fromCache,
                                timeWindow: fees.timeWindow,
                                firstTxTime: fees.firstTxTime,
                                lastTxTime: fees.lastTxTime,
                            });
                            await setCache('playload', 'latest', payloadData, profileId as string);
                        } catch (feesCacheHitErr) {
                            console.warn('[analyze-profile] Failed rebuilding fee snapshot on cache hit', feesCacheHitErr);
                        }
                    }

                    if (!payloadData.resourceFlows || typeof payloadData.resourceFlows !== 'object') {
                        try {
                            console.log('[analyze-profile] Cached playload missing resourceFlows, rebuilding Phase 8');
                            const resourceFlows = await decodeResources(profileId as string);
                            payloadData = Object.assign({}, payloadData, { resourceFlows });
                            await setCache('playload', 'latest', payloadData, profileId as string);
                        } catch (phase8CacheHitErr) {
                            console.warn('[analyze-profile] Failed rebuilding resourceFlows on cache hit', phase8CacheHitErr);
                        }
                    }

                    if (isUsableCachedPlayload(payloadData)) {
                        console.log('[analyze-profile] Serving cached playload');
                        if (cachedPlayload.savedAt) {
                            res.set('X-Cache-Hit', 'disk');
                            res.set('X-Cache-Timestamp', String(cachedPlayload.savedAt));
                        }
                        return res.json(payloadData);
                    }

                    console.warn('[analyze-profile] Cached playload is all-zero, forcing a fresh recompute');
                }
            } catch (cacheErr) {
                console.log('[analyze-profile] No cached playload found, proceeding with analysis');
            }
        }

        const lockState = await waitForProfileAnalysisLock(profileId, {
            timeoutMs: 45_000,
            pollMs: 250,
            staleMs: 180_000,
        });
        releaseAnalysisLock = lockState.release;
        const waitedMs = lockState.waitedMs;

        if (!releaseAnalysisLock) {
            const cachedPlayload = await getCache('playload', 'latest', profileId);
            if (cachedPlayload?.data && isUsableCachedPlayload(cachedPlayload.data)) {
                console.log('[analyze-profile] Lock wait timed out but a fresh cached playload is available; serving it');
                if (cachedPlayload.savedAt) {
                    res.set('X-Cache-Hit', 'disk');
                    res.set('X-Cache-Timestamp', String(cachedPlayload.savedAt));
                }
                return res.json(cachedPlayload.data);
            }
            res.set('Retry-After', '3');
            return res.status(409).json({ error: 'Analysis already running for this profile, retry shortly' });
        }

        if (waitedMs > 0) {
            const cachedPlayload = await getCache('playload', 'latest', profileId);
            if (cachedPlayload?.data && isUsableCachedPlayload(cachedPlayload.data)) {
                console.log(`[analyze-profile] Another worker completed analysis while waiting (${waitedMs}ms); serving cached playload`);
                if (cachedPlayload.savedAt) {
                    res.set('X-Cache-Hit', 'disk');
                    res.set('X-Cache-Timestamp', String(cachedPlayload.savedAt));
                }
                return res.json(cachedPlayload.data);
            }
        }

            if (wipeCache) {
                try {
                    const profileCacheDir = path.join(process.cwd(), 'cache', profileId);
                    await fs.rm(profileCacheDir, { recursive: true, force: true });
                    console.log(`[analyze-profile] Wiped entire cache for profile: ${profileId}`);
                } catch (wipeErr) {
                    console.log('[analyze-profile] Failed to wipe cache:', wipeErr);
                }
            }

            resetPoolCache(profileId);
            resetHealthMap();
            resetConcurrencyMap();
            resetMetricsMap();

            let profileFactionInfo = {
            profileFaction: null as string | null,
            profileFactionId: null as number | null,
            profileFactionAccount: null as string | null,
        };

        // FASE 1: GET WALLET AUTHORITY
        console.log("###################### INIZIO FASE 1: GET WALLET AUTHORITY #########################");
        const req1: any = { query: { profileId } };
        const res1: any = { json: (data: any) => data, status: () => res1, send: () => { } };
        const walletAuthority = await getWalletAuthorityHandler(req1, res1);

        // FASE 1B: GET PROFILE FACTION
        console.log("###################### FASE 1B: GET PROFILE FACTION #########################");
        profileFactionInfo = await getProfileFactionUtil(profileId).catch((e: unknown) => {
            console.warn(`[analyze-profile] error fetching profile faction: ${e}`);
            return profileFactionInfo;
        });
        console.log('[analyze-profile] Profile faction resolved:', profileFactionInfo);
        console.log("###################### FINE FASE 1B, INIZIO FASE 2: GET WALLET TXS #########################");

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
        const fleets = await fetchProfileFleets(profileId).catch((e: unknown) => { console.log(`[analyze-profile] error fetching fleets: ${e}`); return []; });
        console.log("###################### FINE FASE 4, INIZIO FASE 5: GET RENTED FLEETS #########################");

        // FASE 5: GET RENTED FLEETS
        const rentedFleets = await fetchProfileRentedFleets(profileId).catch((e: unknown) => { console.log(`[analyze-profile] error fetching rented fleets: ${e}`); return []; });
        console.log("###################### FINE FASE 5, INIZIO FASE 6: ASSOCIATE SAGE OPS TO FLEETS #########################");

        // FASE 6: ASSOCIATE SAGE OPS TO FLEETS
        const req6: any = { query: { profileId } };
        const res6: any = { json: (data: any) => data, status: () => res6, send: () => { } };
        const breakdown = await associateSageOpsToFleetsHandler(req6, res6);

        // FASE 6B: DERIVE STARBASE CARGO IDS
        try {
            console.log("###################### FASE 6B: DERIVE STARBASE CARGO IDS #########################");
            const starbaseCargo = await deriveStarbaseCargoIdsForProfile(profileId as string);
            console.log(`[analyze-profile] Starbase cargo IDs derived: ${starbaseCargo.starbaseCargoIds.length}`);
        } catch (phase6bErr) {
            console.warn('[analyze-profile] Phase 6B failed, continuing without starbase cargo cache', phase6bErr);
        }

        console.log("###################### FINE FASE 6, INIZIO FASE 7: PLAYLOAD #########################");

        // FASE 7: PLAYLOAD (aggregazione finale, identica a GET /api/debug/playload)
        const req7: any = { query: { profileId, wipeCache } };
        const res7: any = { json: (data: any) => data, status: () => res7, send: () => { } };
        const playload: any = await playloadHandler(req7, res7);
        // Ensure frontend receives the aggregated fees/breakdown used for displays
        try {
            const fees = await buildFeesDetailed(profileId as string);
            // Merge fee details into returned playload to match frontend expectations
            const merged = Object.assign({}, playload || {}, {
                profileFaction: playload?.profileFaction ?? profileFactionInfo.profileFaction,
                profileFactionId: playload?.profileFactionId ?? profileFactionInfo.profileFactionId,
                profileFactionAccount: playload?.profileFactionAccount ?? profileFactionInfo.profileFactionAccount,
                feesByFleet: fees.feesByFleet,
                feesByOperation: fees.feesByOperation,
                sageFees24h: fees.sageFees24h,
                hourlyFees24h: fees.hourlyFees24h,
                totalSignaturesFetched: fees.totalSignaturesFetched,
                transactionCount24h: fees.transactionCount24h,
                fromCache: fees.fromCache,
                timeWindow: fees.timeWindow,
                firstTxTime: fees.firstTxTime,
                lastTxTime: fees.lastTxTime,
                //breakdown: { feesByFleet: fees.feesByFleet }
            });

            // Save EXACTLY what we send to frontend
            try {
                await setCache('playload', 'latest', merged, profileId as string);
            } catch (saveErr) {
                console.log('[analyze-profile] failed to save playload cache', saveErr);
            }

            // FASE 8: RESOURCE FLOWS ANALYSIS
            let finalPayload = merged;
            try {
                console.log("###################### FASE 8: RESOURCE FLOWS ANALYSIS #########################");
                const resourceFlows = await decodeResources(profileId as string);
                finalPayload = Object.assign({}, merged, { resourceFlows });
                await setCache('playload', 'latest', finalPayload, profileId as string);
                console.log("###################### FINE FASE 8 #########################");
            } catch (phase8Err) {
                console.warn('[analyze-profile] Phase 8 skipped, returning base payload', phase8Err);
            }

            // Clean up all cache except playload/latest.json and rpc-pool.json (unless cachePersist is true)
            if (!cachePersist) {
                try {
                    const cacheDir = path.join(process.cwd(), 'cache', profileId as string);
                    const rootFilesToKeep = new Set(['rpc-pool.json']);

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
                        } else if (!rootFilesToKeep.has(entry.name)) {
                            // Remove any files in the root cache directory
                            await fs.rm(fullPath, { force: true });
                        }
                    }
                    console.log('[analyze-profile] Cache cleaned, kept playload/latest.json and rpc-pool.json');
                } catch (cleanErr) {
                    console.log('[analyze-profile] failed to clean cache', cleanErr);
                }
            }

            console.log("###################### FINE FASE 7: FINE FLUSSO ANALYZE #########################");
            res.set('X-Cache-Hit', 'miss');
            res.set('X-Cache-Timestamp', String(Date.now()));
            return res.json(finalPayload);
        } catch (e) {
            console.log('[analyze-profile] buildFeesDetailed failed', e);

            // Save fallback playload
            try {
                await setCache('playload', 'latest', playload, profileId as string);
            } catch (saveErr) {
                console.log('[analyze-profile] failed to save fallback playload cache', saveErr);
            }

            // Clean up all cache except playload/latest.json and rpc-pool.json (unless cachePersist is true)
            if (!cachePersist) {
                try {
                    const cacheDir = path.join(process.cwd(), 'cache', profileId as string);
                    const rootFilesToKeep = new Set(['rpc-pool.json']);

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
                        } else if (!rootFilesToKeep.has(entry.name)) {
                            await fs.rm(fullPath, { force: true });
                        }
                    }
                    console.log('[analyze-profile] Cache cleaned, kept playload/latest.json and rpc-pool.json');
                } catch (cleanErr) {
                    console.log('[analyze-profile] failed to clean cache', cleanErr);
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
        console.log(`[/api/analyze-profile] ❌ ERROR | profileId=${profileId} | error=${e?.message || e} | duration=${duration}ms`);
        return res.status(500).json({ error: e?.message || 'analyze-profile failed' });
    } finally {
        if (releaseAnalysisLock) {
            await releaseAnalysisLock();
        }
    }
});

export default router;
