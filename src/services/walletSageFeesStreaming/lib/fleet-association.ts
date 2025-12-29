// Logica per costruire la mappa accountToFleet

import type { FleetData } from '../types';
import { loadFleetData } from './fleet-loader';

/**
 * Costruisce una mappa da account a chiave flotta, includendo sub-accounts.
 * @param fleetAccounts Array di chiavi flotte.
 * @returns Map<string, string> dove chiave è account, valore è fleetKey.
 */
export function buildAccountToFleetMap(fleetAccounts: string[]): Map<string, string> {
  const accountToFleet = new Map<string, string>();

  for (const fleetKey of fleetAccounts) {
    // Mappa la chiave principale
    accountToFleet.set(fleetKey, fleetKey);

    // Carica dati e mappa sub-accounts
    const fleetData = loadFleetData(fleetKey);
    if (fleetData) {
      if (fleetData.cargoHold) accountToFleet.set(fleetData.cargoHold, fleetKey);
      if (fleetData.fuelTank) accountToFleet.set(fleetData.fuelTank, fleetKey);
      if (fleetData.ammoBank) accountToFleet.set(fleetData.ammoBank, fleetKey);
    }
  }

  return accountToFleet;
}