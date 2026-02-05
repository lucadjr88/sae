import { Request, Response } from 'express';
import { getWalletAuthorityUtil } from '../../utils/getWalletAuthority';

export async function getWalletAuthorityHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  console.log(`[get-wallet-authority] profileId=${profileId}`);
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await getWalletAuthorityUtil(profileId);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'getWalletAuthority failed' });
  }
}
