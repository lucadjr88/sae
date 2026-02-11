import { Request, Response } from 'express';
import buildFeesDetailed from '../../utils/buildFeesDetailed';

export async function walletSageFeesDetailedHandler(req: Request, res: Response) {
  const profileId = (req.body && req.body.profileId) || (req.query && req.query.profileId);
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await buildFeesDetailed(profileId as string);
    return res.json(result);
  } catch (e: any) {
    console.error('[walletSageFeesDetailed] Error', e);
    return res.status(500).json({ error: e?.message || 'walletSageFeesDetailed failed' });
  }
}
