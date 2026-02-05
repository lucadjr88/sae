import fs from 'fs/promises';
import path from 'path';
import { setCache, getCache } from '../../utils/cache';
export async function playloadHandler(req, res) {
    const profileId = (req.query && req.query.profileId);
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        // Leggi i dati necessari dalla cache, non ricalcolare nulla!
        // Aggrega tutti i file JSON nelle cartelle
        async function aggregateCacheDir(namespace) {
            const dir = path.join(process.cwd(), 'cache', profileId, namespace);
            try {
                const files = await fs.readdir(dir);
                const arr = [];
                for (const file of files) {
                    if (!file.endsWith('.json'))
                        continue;
                    try {
                        const raw = await fs.readFile(path.join(dir, file), 'utf8');
                        const parsed = JSON.parse(raw);
                        arr.push(parsed.data || parsed);
                    }
                    catch { }
                }
                return arr;
            }
            catch {
                return [];
            }
        }
        // walletAuthority e feePayer
        const metaCache = await getCache('', profileId, profileId);
        const payload = {
            fleets: await aggregateCacheDir('fleets'),
            rentedFleets: await aggregateCacheDir('rented-fleets'),
            walletAuthority: metaCache?.data?.walletAuthority,
            feePayer: metaCache?.data?.feePayer,
            fleetBreakdown: await aggregateCacheDir('fleet-breakdowns'),
            playerOps: await aggregateCacheDir('player-ops'),
            // aggiungi altri campi se necessario
        };
        // If we have a normalized fleets cache, use it in the response to match frontend shape.
        try {
            const cachedFleets = await getCache('fleets', profileId, profileId);
            if (cachedFleets && cachedFleets.data) {
                payload.fleets = cachedFleets.data;
            }
            else if (Array.isArray(payload.fleets)) {
                // fallback: normalize raw fleets on the fly
                payload.fleets = payload.fleets.map((f) => ({
                    key: f.pubkey || f.pubkey?.toString?.(),
                    callsign: f.fleet_label || f.callsign || null,
                    isRented: false,
                    data: {
                        fleetShips: f.fleet_ships || f.fleetShips || null,
                        fuelTank: f.fuel_tank || f.fuelTank || null,
                        ammoBank: f.ammo_bank || f.ammoBank || null,
                        cargoHold: f.cargo_hold || f.cargoHold || null,
                        stats: f.stats || null,
                        pubkey: f.pubkey || null,
                        updateId: f.update_id || f.updateId || null,
                        bump: f.bump || null,
                        raw: f.raw || null,
                        decodedInstructions: f.decodedInstructions || f.decoded_instructions || []
                    }
                }));
            }
            // persist playload in cache for quick retrieval
            try {
                await setCache('playload', 'latest', payload, profileId);
            }
            catch (e) {
                console.error('[playload] failed to persist playload cache', e);
            }
        }
        catch (e) {
            console.error('[playload] error merging normalized fleets', e);
        }
        return res.json(payload);
    }
    catch (e) {
        console.error('[playload] error', e);
        return res.status(500).json({ error: e?.message || 'playload failed' });
    }
}
export default playloadHandler;
