import fs from 'fs/promises';
import path from 'path';
import { getCache } from '../utils/cache.js';

async function aggregateCacheDir(profileId: string, namespace: string) {
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
      } catch (error) {
        console.warn(`[playload] Failed to read cached file ${path.join(dir, file)}:`, error);
      }
    }
    return arr;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn(`[playload] Failed to read cache directory ${dir}:`, error);
    }
    return [];
  }
}

function cleanFleetData(f: any) {
  if (!f || !f.data) return f;
  const { decodedInstructions, decoded_instructions, ...cleanData } = f.data;
  return { ...f, data: cleanData };
}

export async function buildCachedPayload(profileId: string) {
  const metaCache = await getCache('', profileId, profileId);
  const meta = metaCache?.data || metaCache || {};
  let rawFleets = await aggregateCacheDir(profileId, 'fleets');
  const cachedFleets = await getCache('fleets', profileId, profileId);
  if (cachedFleets && cachedFleets.data) {
    rawFleets = cachedFleets.data;
  } else if (Array.isArray(rawFleets)) {
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
        raw: f.raw || null,
      },
    }));
  }

  const cleanFleets = Array.isArray(rawFleets) ? rawFleets.map(cleanFleetData) : rawFleets;
  return {
    fleets: cleanFleets,
    rentedFleets: await aggregateCacheDir(profileId, 'rented-fleets'),
    walletAuthority: meta?.walletAuthority,
    feePayer: meta?.feePayer,
    profileFaction: meta?.profileFaction ?? null,
    profileFactionId: typeof meta?.profileFactionId === 'number' ? meta.profileFactionId : null,
    profileFactionAccount: meta?.profileFactionAccount ?? null,
    fleetBreakdown: await aggregateCacheDir(profileId, 'fleet-breakdowns'),
    playerOps: await aggregateCacheDir(profileId, 'player-ops'),
  };
}
