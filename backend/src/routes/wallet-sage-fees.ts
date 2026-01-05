import { Request, Response } from 'express';
import { getWalletSageTransactions } from '../services/wallet/walletTransactions.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../config/serverConfig.js';

/**
 * API: 07 - Wallet SAGE Transactions & Fees
 */
export async function walletSageFeesHandler(req: Request, res: Response) {
  const { profileId, limit } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    const result = await getWalletSageTransactions(RPC_ENDPOINT, RPC_WEBSOCKET, profileId, limit || 100);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}