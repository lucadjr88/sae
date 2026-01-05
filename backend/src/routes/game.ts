import { Request, Response } from 'express';
import { getGameInfo } from '../services/game/getGameInfo.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH } from '../config/serverConfig.js';

/**
 * API: 01 - Game Info
 */
export async function gameHandler(_req: Request, res: Response) {
  try {
    const result = await getGameInfo(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
}