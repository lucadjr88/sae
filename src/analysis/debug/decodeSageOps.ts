import { Request, Response } from 'express';
import { decodeSageOpsUtil } from '../../utils/decodeSageOps';

export async function decodeSageOpsHandler(req: Request, res: Response) {
  const wallet = req.query.wallet as string;
  const lats = req.query.lats ? Number(req.query.lats) : 24;
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });
  try {
    const result = await decodeSageOpsUtil(wallet, lats);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'decodeSageOps failed' });
  }
}
