import { Request, Response } from 'express';
import { getPlanets } from '../services/game/getPlanets.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';

/**
 * API: 04 - Planets
 */
export async function planetsHandler(req: Request, res: Response) {
  const { x, y } = req.body;
  if (x === undefined || y === undefined) {
    return res.status(400).json({ error: 'x and y coordinates required' });
  }
  try {
    const result = await getPlanets(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, parseInt(x), parseInt(y));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}