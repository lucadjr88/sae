import { Request, Response } from 'express';
import { fetchProfileWalletTransactions } from '../fetchProfileWalletTransactions.js';

export async function getWalletTxsHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  const cutoffH = req.query.cutoffH ? Number(req.query.cutoffH) : 24;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await fetchProfileWalletTransactions(profileId, cutoffH);
    if (result.ok === false) return res.status(404).json({ error: result.error });
    return res.json({ profileId: result.profileId, cutoffH: result.cutoffH, results: result.results });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'getWalletTxs failed' });
  }
}
