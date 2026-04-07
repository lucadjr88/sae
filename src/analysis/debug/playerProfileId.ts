import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { findPlayerProfilesForWalletWithRpc } from '../../utils/derivePlayerProfilePDA.js';
import { getCache } from '../../utils/cache.js';

export async function playerProfileIdHandler(req: Request, res: Response) {
  const wallet = req.query.wallet as string;
  if (!wallet) return res.status(400).json({ error: 'Missing wallet query parameter' });

  try {
    const walletPubkey = new PublicKey(wallet);
    // Pass undefined as rpcUrl to use healthy RPC selection
    const profiles = await findPlayerProfilesForWalletWithRpc(walletPubkey, undefined);
    const variants = await Promise.all(
      profiles.map(async (profile: any) => {
        const profileId = typeof profile?.profileId === 'string' ? profile.profileId.trim() : '';
        if (!profileId) return profile;

        try {
          const cachedPlayload = await getCache('playload', 'latest', profileId);
          const cachedMeta = await getCache('', profileId, profileId);
          const playloadData = cachedPlayload?.data || {};
          const metaData = cachedMeta?.data || cachedMeta || {};
          const profileFaction = playloadData.profileFaction ?? metaData.profileFaction ?? null;
          const profileFactionId = playloadData.profileFactionId ?? metaData.profileFactionId ?? null;

          return {
            ...profile,
            profileFaction,
            profileFactionId,
          };
        } catch {
          return profile;
        }
      })
    );

    return res.json({
      wallet,
      message: 'Player Profile account(s) found on-chain for wallet',
      variants,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to find player profile accounts' });
  }
}
