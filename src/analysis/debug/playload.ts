import { Request, Response } from 'express';
import { buildCachedPayload } from '../buildCachedPayload.js';

export async function playloadHandler(req: Request, res: Response) {
  const profileId = (req.query && req.query.profileId) as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    return res.json(await buildCachedPayload(profileId));
  } catch (error: any) {
    console.log('[playload] error', error);
    return res.status(500).json({ error: error?.message || 'playload failed' });
  }
}

export default playloadHandler;
