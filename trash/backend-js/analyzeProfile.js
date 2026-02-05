import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
const router = Router();
async function clearNamespaces(profileId) {
    const toClear = ['sage-ops', 'unknown', 'fleet-breakdowns', 'player-ops', 'reports', 'playload'];
    for (const ns of toClear) {
        const dir = path.join(process.cwd(), 'cache', profileId, ns);
        try {
            await fs.rm(dir, { recursive: true, force: true });
        }
        catch (e) {
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
router.post('/analyze-profile', async (req, res) => {
    const { profileId, wipeCache, lats } = req.body || {};
    if (!profileId || typeof profileId !== 'string')
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        // FASE 1: GET WALLET AUTHORITY
        console.log("###################### INIZIO FASE 1: GET WALLET AUTHORITY #########################");
        const req1 = { query: { profileId } };
        const res1 = { json: (data) => data, status: () => res1, send: () => { } };
        const walletAuthority = await getWalletAuthorityHandler(req1, res1);
        console.log("###################### FINE FASE 1, INIZIO FASE 2: GET WALLET TXS #########################");
        // FASE 2: GET WALLET TXS
        const req2 = { query: { profileId, cutoffH: lats || 24 } };
        const res2 = { json: (data) => data, status: () => res2, send: () => { } };
        const walletTxs = await getWalletTxsHandler(req2, res2);
        console.log("###################### FINE FASE 2, INIZIO FASE 3: DECODE SAGE OPS #########################");
        // FASE 3: DECODE SAGE OPS
        const req3 = { query: { profileId } };
        const res3 = { json: (data) => data, status: () => res3, send: () => { } };
        const sageOps = await decodeSageOpsFullHandler(req3, res3);
        console.log("###################### FINE FASE 3, INIZIO FASE 4: GET FLEETS #########################");
        // FASE 4: GET FLEETS
        const req4 = { query: { profileId } };
        const res4 = { json: (data) => data, status: () => res4, send: () => { } };
        const fleets = await getFleetsHandler(req4, res4);
        console.log("###################### FINE FASE 4, INIZIO FASE 5: GET RENTED FLEETS #########################");
        // FASE 5: GET RENTED FLEETS
        const req5 = { query: { profileId } };
        const res5 = { json: (data) => data, status: () => res5, send: () => { } };
        const rentedFleets = await getRentedFleetsHandler(req5, res5);
        console.log("###################### FINE FASE 5, INIZIO FASE 6: ASSOCIATE SAGE OPS TO FLEETS #########################");
        // FASE 6: ASSOCIATE SAGE OPS TO FLEETS
        const req6 = { query: { profileId } };
        const res6 = { json: (data) => data, status: () => res6, send: () => { } };
        const breakdown = await associateSageOpsToFleetsHandler(req6, res6);
        console.log("###################### FINE FASE 6, INIZIO FASE 7: PLAYLOAD #########################");
        // FASE 7: PLAYLOAD (aggregazione finale, identica a GET /api/debug/playload)
        const req7 = { query: { profileId, wipeCache } };
        const res7 = { json: (data) => data, status: () => res7, send: () => { } };
        const playload = await playloadHandler(req7, res7);
        console.log("###################### FINE FASE 7: FINE FLUSSO ANALYZE #########################");
        return res.json(playload);
    }
    catch (e) {
        console.error('[analyze-profile] error', e);
        return res.status(500).json({ error: e?.message || 'analyze-profile failed' });
    }
});
export default router;
