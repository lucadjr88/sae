// Estrae la lista di sub-account da una cache fleet
import fs from 'fs';
import path from 'path';

export function getSubAccountsForFleet(fleetKey: string, cacheDir = 'cache/fleets'): string[] {
  const cachePath = path.join(cacheDir, `${fleetKey}.json`);
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const fleet = JSON.parse(raw);
    if (!fleet.subAccounts || !Array.isArray(fleet.subAccounts)) return [];
    return fleet.subAccounts;
  } catch (err) {
    // Log errore e ritorna array vuoto
    console.error(`Errore lettura cache per fleetKey ${fleetKey}:`, err);
    return [];
  }
}
