import { Request, Response } from 'express';
import { decodeCachedSageOps } from '../decodeCachedSageOps.js';

export async function decodeSageOpsFullHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    return res.json(await decodeCachedSageOps(profileId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'decodeSageOpsFull failed' });
  }
}
