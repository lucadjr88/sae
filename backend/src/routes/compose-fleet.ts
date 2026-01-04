import { Request, Response } from 'express';
import { getShipsForFleet } from '../examples/05-compose-fleet.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';

/**
 * API: 05 - Ships for Fleet Composition
 */
export async function composeFleetHandler(req: Request, res: Response) {
  const { profileId, x, y } = req.body;
  if (!profileId || x === undefined || y === undefined) {
    return res.status(400).json({ error: 'profileId, x, and y required' });
  }
  try {
    const result = await getShipsForFleet(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId, parseInt(x), parseInt(y));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}