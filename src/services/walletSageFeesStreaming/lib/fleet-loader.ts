// Helper per caricare dati delle flotte dalla cache

import * as fs from 'fs';
import * as path from 'path';
import type { FleetData } from '../types';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'fleets');

/**
 * Carica i dati di una flotta dalla cache.
 * @param fleetKey La chiave della flotta.
 * @returns FleetData o null se non trovato o errore.
 */
export function loadFleetData(fleetKey: string): FleetData | null {
  const filePath = path.join(CACHE_DIR, `${fleetKey}.json`);
  try {
    const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return cacheData.data?.data || null;
  } catch (err) {
    // Log errore ma non bloccare
    console.warn(`Failed to load fleet data for ${fleetKey}:`, String(err));
    return null;
  }
}