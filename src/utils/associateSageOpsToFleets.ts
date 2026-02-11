import fs from 'fs/promises';
import path from 'path';
import { setCache } from './cache';

function getCacheDir(profileId: string, namespace: string) {
  return path.join(process.cwd(), 'cache', profileId, namespace);
}

async function readJsonFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function associateSageOpsToFleetsUtil(profileId: string): Promise<{fleetBreakdown: any[], playerOps: any[]}> {
  const fleetsDir = getCacheDir(profileId, 'fleets');
  const rentedDir = getCacheDir(profileId, 'rented-fleets');
  const sageOpsDir = getCacheDir(profileId, 'sage-ops');

  // load fleets
  const fleetFiles: string[] = [];
  try {
    const f = await fs.readdir(fleetsDir);
    fleetFiles.push(...f.map(fn => path.join(fleetsDir, fn)));
  } catch (e) {
    // ignore
  }
  try {
    const rf = await fs.readdir(rentedDir);
    fleetFiles.push(...rf.map(fn => path.join(rentedDir, fn)));
  } catch (e) {
    // ignore
  }

  const fleets: Record<string, any> = {};
  for (const fpath of fleetFiles) {
    const data = await readJsonFile(fpath);
    if (!data) continue;
    // Some saved fleet files may wrap content in { savedAt, data }
    const fleet = data.data ?? data;
    if (!fleet || !fleet.pubkey) continue;
    fleets[fleet.pubkey] = fleet;
  }

  console.log(`[associateSageOpsToFleets] profileId=${profileId} loadedFleets=${Object.keys(fleets).length}`);

  // Prepare breakdown map
  const breakdowns: Record<string, { fleet: any; ops: any[] }> = {};
  for (const pk of Object.keys(fleets)) breakdowns[pk] = { fleet: fleets[pk], ops: [] };

  // load sage ops
  const sageFiles: string[] = [];
  try {
    const sf = await fs.readdir(sageOpsDir);
    sageFiles.push(...sf.map(fn => path.join(sageOpsDir, fn)));
  } catch (e) {
    // no sage ops
  }

  const playerOps: any[] = [];

  for (const sPath of sageFiles) {
    const sRaw = await readJsonFile(sPath);
    if (!sRaw) continue;
    const op = sRaw.data ?? sRaw;

    // Collect account keys from several possible fields
    const keys = new Set<string>();
    const staticKeys = op.txInfo?.staticAccountKeys ?? op.staticAccountKeys;
    if (Array.isArray(staticKeys)) {
      for (const k of staticKeys) keys.add(k);
    }
    const loaded = op?.txInfo?.meta?.loadedAddresses;
    if (loaded) {
      if (Array.isArray(loaded.readonly)) for (const k of loaded.readonly) keys.add(k);
      if (Array.isArray(loaded.writable)) for (const k of loaded.writable) keys.add(k);
    }
    // fallback: top-level accounts field (array of pubkeys)
    if (Array.isArray(op.accounts)) for (const k of op.accounts) keys.add(k);

    // try to match against fleets
    let matched = false;
    for (const [fleetPk, fleet] of Object.entries(fleets)) {
      if (!fleet) continue;
      const acctCandidates = [fleet.pubkey, fleet.cargo_hold, fleet.fuel_tank, fleet.ammo_bank];
      for (const a of acctCandidates) {
        if (!a) continue;
        if (keys.has(a)) {
          breakdowns[fleetPk].ops.push(op);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      // save as player op later
      playerOps.push(op);
    }
  }

  // persist breakdowns and player-ops
  const savedBreakdowns: any[] = [];
  for (const [fleetPk, b] of Object.entries(breakdowns)) {
    if (b.ops.length === 0) continue;
    await setCache('fleet-breakdowns', fleetPk, { fleet: b.fleet, ops: b.ops }, profileId);
    savedBreakdowns.push({ fleetPk, count: b.ops.length });
  }

  for (const op of playerOps) {
    const signature = op.signature || op.txHash || `op-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await setCache('player-ops', signature, op, profileId);
  }

  const matchedCount = savedBreakdowns.reduce((s, b) => s + (b.count || 0), 0);
  console.log(`[associateSageOpsToFleets] profileId=${profileId} sageOps=${sageFiles.length} matched=${matchedCount} unmatched=${playerOps.length}`);
  console.log(`[associateSageOpsToFleets] savedBreakdowns=${JSON.stringify(savedBreakdowns)}`);

  return { fleetBreakdown: savedBreakdowns, playerOps: playerOps.map(o => ({ signature: o.signature })) };
}
