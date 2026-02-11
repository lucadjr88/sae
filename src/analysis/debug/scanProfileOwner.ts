import { scanProfileOwnerUtil } from '../../utils/scanProfileOwner';
import { Request, Response } from 'express';

export async function scanProfileOwnerHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await scanProfileOwnerUtil(profileId);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Scan profile owner failed' });
  }
}
