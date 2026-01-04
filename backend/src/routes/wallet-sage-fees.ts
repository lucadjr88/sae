import { Request, Response } from 'express';
import { getWalletSageTransactions } from '../examples/wallet-sage-transactions.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from '../config/serverConfig.js';

/**
 * API: 07 - Wallet SAGE Transactions & Fees
 */
export async function walletSageFeesHandler(req: Request, res: Response) {
  const { walletPubkey, limit } = req.body;
  if (!walletPubkey) {
    return res.status(400).json({ error: 'walletPubkey required' });
  }
  try {
    const result = await getWalletSageTransactions(RPC_ENDPOINT, RPC_WEBSOCKET, walletPubkey, limit || 100);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}