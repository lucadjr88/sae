import { Request, Response } from 'express';
import { getFleets } from '../services/fleet/getFleets.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';
import { globalPoolConnection } from '../index.js';

/**
 * Debug API: Verifica associazione account-flotte
 */
export async function debugFleetAssociationCheckHandler(req: Request, res: Response) {
  const { profileId, fleetAccounts, fleetNames } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  if (!fleetAccounts || !Array.isArray(fleetAccounts)) {
    return res.status(400).json({ error: 'fleetAccounts array required' });
  }

  try {
    // Ottieni flotte reali dal profilo
    const { fleets, walletAuthority } = await getFleets(RPC_ENDPOINT, globalPoolConnection || RPC_WEBSOCKET, WALLET_PATH, profileId);

    // Costruisci set di account reali
    const realFleetAccounts = new Set<string>();
    const realFleetNames: { [account: string]: string } = {};
    fleets.forEach(f => {
      realFleetAccounts.add(f.key);
      if (f.data?.fleetShips) realFleetAccounts.add(f.data.fleetShips);
      if (f.data?.fuelTank) realFleetAccounts.add(f.data.fuelTank);
      if (f.data?.ammoBank) realFleetAccounts.add(f.data.ammoBank);
      if (f.data?.cargoHold) realFleetAccounts.add(f.data.cargoHold);

      const name = f.callsign;
      realFleetNames[f.key] = name;
      if (f.data?.fleetShips) realFleetNames[f.data.fleetShips] = name;
      if (f.data?.fuelTank) realFleetNames[f.data.fuelTank] = name;
      if (f.data?.ammoBank) realFleetNames[f.data.ammoBank] = name;
      if (f.data?.cargoHold) realFleetNames[f.data.cargoHold] = name;
    });

    // Verifica account passati
    const passedAccounts = new Set(fleetAccounts);
    const orphanedAccounts = Array.from(passedAccounts).filter(acc => !realFleetAccounts.has(acc));
    const missingAccounts = Array.from(realFleetAccounts).filter(acc => !passedAccounts.has(acc));

    // Validazione per account passati
    const validation: { [account: string]: { isValid: boolean; realName?: string; passedName?: string; match: boolean } } = {};
    passedAccounts.forEach(acc => {
      const realName = realFleetNames[acc];
      const passedName = fleetNames?.[acc];
      const isValid = realFleetAccounts.has(acc);
      const match = isValid && (!passedName || passedName === realName);
      validation[acc] = {
        isValid,
        realName,
        passedName,
        match
      };
    });

    res.json({
      profileId,
      walletAuthority,
      totalRealFleets: fleets.length,
      totalRealAccounts: realFleetAccounts.size,
      totalPassedAccounts: passedAccounts.size,
      orphanedAccounts, // account passati ma non reali
      missingAccounts,  // account reali ma non passati
      validation,
      fleetsSummary: fleets.map(f => ({
        callsign: f.callsign,
        key: f.key,
        accounts: [
          f.key,
          f.data?.fleetShips,
          f.data?.fuelTank,
          f.data?.ammoBank,
          f.data?.cargoHold
        ].filter(Boolean)
      }))
    });
  } catch (err: any) {
    console.error('❌ /api/debug/fleet-association-check error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}