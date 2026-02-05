import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { setCache, getCache } from '../../utils/cache';

export async function playloadHandler(req: Request, res: Response) {
  const profileId = (req.query && req.query.profileId) as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {

    // Leggi i dati necessari dalla cache, non ricalcolare nulla!
    // Aggrega tutti i file JSON nelle cartelle
    async function aggregateCacheDir(namespace: string) {
      const dir = path.join(process.cwd(), 'cache', profileId, namespace);
      try {
        const files = await fs.readdir(dir);
        const arr = [];
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          try {
            const raw = await fs.readFile(path.join(dir, file), 'utf8');
            const parsed = JSON.parse(raw);
            arr.push(parsed.data || parsed);
          } catch {}
        }
        return arr;
      } catch { return []; }
    }

    // Helper function to remove decodedInstructions from fleet data
    function cleanFleetData(f: any) {
      if (!f) return f;
      if (!f.data) return f;
      
      // Create clean data object without decodedInstructions
      const { decodedInstructions, decoded_instructions, ...cleanData } = f.data;
      return { ...f, data: cleanData };
    }

    // walletAuthority e feePayer
    const metaCache = await getCache('', profileId, profileId);

    let rawFleets = await aggregateCacheDir('fleets');
    
    // Check if we have a normalized fleets cache
    const cachedFleets = await getCache('fleets', profileId, profileId);
    if (cachedFleets && cachedFleets.data) {
      rawFleets = cachedFleets.data;
    } else if (Array.isArray(rawFleets)) {
      // Normalize raw fleets on the fly
      rawFleets = rawFleets.map((f: any) => ({
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
          raw: f.raw || null
          // NOTE: deliberately NOT including decodedInstructions here
        }
      }));
    }

    // Clean all fleets - remove decodedInstructions
    const cleanFleets = Array.isArray(rawFleets) 
      ? rawFleets.map(cleanFleetData) 
      : rawFleets;

    // Build the final clean payload (NO SAVE HERE - will be saved by caller)
    const cleanPayload: any = {
      fleets: cleanFleets,
      rentedFleets: await aggregateCacheDir('rented-fleets'),
      walletAuthority: metaCache?.data?.walletAuthority,
      feePayer: metaCache?.data?.feePayer,
      fleetBreakdown: await aggregateCacheDir('fleet-breakdowns'),
      playerOps: await aggregateCacheDir('player-ops'),
    };

    // Return the clean payload - will be saved by analyzeProfile after merging fees
    return res.json(cleanPayload);
  } catch (e: any) {
    console.error('[playload] error', e);
    return res.status(500).json({ error: e?.message || 'playload failed' });
  }
}

export default playloadHandler;
