import { dumpProfileHexUtil } from '../../utils/dumpProfileHex';
import { Request, Response } from 'express';

export async function dumpProfileHexHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await dumpProfileHexUtil(profileId);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Dump profile hex failed' });
  }
}
