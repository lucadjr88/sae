import { Request, Response } from 'express';
import { getFleets } from '../services/fleet/getFleets.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';

/**
 * Diagnostica: Fleet account/name/rental map per un profilo
 */
export async function diagnosticsFleetMapHandler(req: Request, res: Response) {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    const { fleets, walletAuthority } = await getFleets(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
    const map: { [account: string]: { name: string; isRented: boolean } } = {};
    const rows = fleets.map((f: any) => {
      const name = f.callsign;
      const isRented = !!f.isRented;
      const accounts = [
        f.key,
        f.data?.fleetShips,
        f.data?.fuelTank,
        f.data?.ammoBank,
        f.data?.cargoHold,
      ].filter((x: string | undefined) => !!x);
      accounts.forEach((acc: string) => { map[acc] = { name, isRented }; });
      return {
        name,
        key: f.key,
        fleetShips: f.data?.fleetShips,
        fuelTank: f.data?.fuelTank,
        ammoBank: f.data?.ammoBank,
        cargoHold: f.data?.cargoHold,
        owningProfile: f.data?.owningProfile?.toString?.() || null,
        subProfile: f.data?.subProfile?.toString?.() || null,
        isRented,
      };
    });
    res.json({ success: true, walletAuthority, rows, map });
  } catch (err: any) {
    console.error('❌ /api/diagnostics/fleet-map error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}