import { decodeProfileWithRustUtil } from '../../utils/decodeProfileWithRust';
import { fetchSolanaAccountInfo } from '../../utils/fetchSolanaAccountInfo';
import { Request, Response } from 'express';

export async function decodeProfileWithRustHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await decodeProfileWithRustUtil(profileId, fetchSolanaAccountInfo);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Decode failed' });
  }
}
