// Logica per costruire la mappa accountToFleet

import type { FleetData } from '../types';
import { loadFleetData } from './fleet-loader';

/**
 * Costruisce una mappa da account a chiave flotta, includendo sub-accounts.
 * @param fleetAccounts Array di chiavi flotte.
 * @returns Map<string, string> dove chiave è account, valore è fleetKey.
 */

// Fallback: tenta di recuperare sub-account tramite logica alternativa (es. parsing transazioni, RPC pool, ecc.)
async function fallbackSubAccounts(fleetKey: string): Promise<string[]> {
  // TODO: qui si può implementare una logica più complessa (RPC, fetch, ecc.)
  // Per ora ritorna array vuoto (placeholder)
  // Esempio: chiamata a un modulo che estrae sub-account da transazioni recenti
  return [];
}

/**
 * Costruisce una mappa da account a chiave flotta, includendo sub-accounts.
 * Se la cache manca, tenta fallback automatico.
 * @param fleetAccounts Array di chiavi flotte.
 * @returns Map<string, string> dove chiave è account, valore è fleetKey.
 */
export function buildAccountToFleetMap(fleetAccounts: string[]): Map<string, string> {
  const accountToFleet = new Map<string, string>();

  for (const fleetKey of fleetAccounts) {
    // Carica dati e mappa sub-accounts
    const fleetData = loadFleetData(fleetKey);
    if (fleetData) {
      // Mappa la chiave principale solo se abbiamo dati (evita phantom fleets)
      accountToFleet.set(fleetKey, fleetKey);

      if (fleetData.cargoHold) accountToFleet.set(fleetData.cargoHold, fleetKey);
      if (fleetData.fuelTank) accountToFleet.set(fleetData.fuelTank, fleetKey);
      if (fleetData.ammoBank) accountToFleet.set(fleetData.ammoBank, fleetKey);
      // Estensione: mappa anche ownerProfile, fleetShips, subProfile, subProfileInvalidator
      if (fleetData.ownerProfile) accountToFleet.set(fleetData.ownerProfile, fleetKey);
      if (fleetData.fleetShips) accountToFleet.set(fleetData.fleetShips, fleetKey);
      if (fleetData.subProfile && typeof fleetData.subProfile.key === 'string') accountToFleet.set(fleetData.subProfile.key, fleetKey);
      if (fleetData.subProfileInvalidator) accountToFleet.set(fleetData.subProfileInvalidator, fleetKey);
    } else {
      // Se la cache manca, non mappiamo nulla per questa flotta.
      // Questo eviterà che compaia nel breakdown se non è una flotta valida.
      console.warn(`[buildAccountToFleetMap] Skip fleetKey ${fleetKey} (no cache data)`);
    }
  }

  return accountToFleet;
}