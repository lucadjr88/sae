import { Request, Response } from 'express';
import { getFleetTransactions } from '../services/fleet/transactions.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../config/serverConfig.js';

/**
 * API: 06 - Fleet Transactions
 */
export async function transactionsHandler(req: Request, res: Response) {
  const { accountPubkey, limit } = req.body;
  if (!accountPubkey) {
    return res.status(400).json({ error: 'accountPubkey required' });
  }
  try {
    const result = await getFleetTransactions(RPC_ENDPOINT, RPC_WEBSOCKET, accountPubkey, limit || 50);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}