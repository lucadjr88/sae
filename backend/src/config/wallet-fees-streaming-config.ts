import { existsSync, readFileSync } from 'fs';

export const excludeAccounts = [
  'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
  'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr',
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
];

export const MATERIALS: Record<string, string> = {
  'MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog': 'Biomass',
  'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG': 'Food',
  'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim': 'Fuel',
  'HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp': 'Hydrogen',
};

export const BATCH_SETTINGS = {
  batchSize: 150,
  minDelay: 70,
  maxDelay: 5000,
  backoffMultiplier: 1.5,
  successProbeWindow: 25,
  successDecreaseStep: 5,
  jitterPct: 0.10,
  maxRetries: 5,
};

export interface FleetMaps {
  allowedFleetKeys: Set<string>;
  accountToFleet: Map<string, string>;
  resolveFleetKey: (val?: string) => string | undefined;
}

export function buildFleetMaps(
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  enableSubAccountMapping: boolean = false
): FleetMaps {
  const CACHE_DIR = '../cache/fleets';
  const validFleetAccounts = (fleetAccounts || []).filter(key => {
    const filePath = `../cache/fleets/${key}.json`;
    return existsSync(filePath);
  });

  const allowedFleetKeys = new Set<string>(validFleetAccounts);
  const accountToFleet = new Map<string, string>();
  const fleetNameToKey = new Map<string, string>();

  for (const [k, v] of Object.entries(fleetAccountNames || {})) {
    if (v) {
      if (!fleetNameToKey.has(v)) fleetNameToKey.set(v, k);
      const lc = v.toLowerCase();
      if (!fleetNameToKey.has(lc)) fleetNameToKey.set(lc, k);
    }
    if (!fleetNameToKey.has(k)) fleetNameToKey.set(k, k);
  }

  const resolveFleetKey = (val?: string): string | undefined => {
    if (!val) return undefined;
    if (fleetNameToKey.has(val)) return fleetNameToKey.get(val);
    const lc = val.toLowerCase();
    return fleetNameToKey.get(lc);
  };

  const specificFleetAccounts = fleetAccounts.filter(account => account && !excludeAccounts.includes(account) && account.length > 40);

  for (const fleetKey of specificFleetAccounts) {
    accountToFleet.set(fleetKey, fleetKey);
    if (!enableSubAccountMapping) continue;
    try {
      const filePath = `../cache/fleets/${fleetKey}.json`;
      if (require('fs').existsSync(filePath)) {
        const cacheData = JSON.parse(readFileSync(filePath, 'utf8'));
        const fleetData = cacheData.data?.data;
        if (fleetData) {
          if (fleetData.cargoHold) accountToFleet.set(fleetData.cargoHold, fleetKey);
          if (fleetData.fuelTank) accountToFleet.set(fleetData.fuelTank, fleetKey);
          if (fleetData.ammoBank) accountToFleet.set(fleetData.ammoBank, fleetKey);
          if (fleetData.fleetShips) accountToFleet.set(fleetData.fleetShips, fleetKey);
          if (fleetData.ownerProfile) accountToFleet.set(fleetData.ownerProfile, fleetKey);
          if (fleetData.subProfile && fleetData.subProfile.key && fleetData.subProfile.key !== '11111111111111111111111111111111') {
            accountToFleet.set(fleetData.subProfile.key, fleetKey);
          }
        }
      }
    } catch (e) {}
  }

  return { allowedFleetKeys, accountToFleet, resolveFleetKey };
}

export function filterFleetBuckets(buckets: any, allowedFleetKeys: Set<string>): Record<string, any> {
  const filtered: Record<string, any> = {};
  Object.entries(buckets || {}).forEach(([k, v]) => {
    if (allowedFleetKeys.has(k)) filtered[k] = v;
  });
  return filtered;
}