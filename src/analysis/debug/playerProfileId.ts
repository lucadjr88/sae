import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { findPlayerProfilesForWalletWithRpc } from '../../utils/derivePlayerProfilePDA.js';
import { getCache } from '../../utils/cache.js';
import { getProfileFactionUtil } from '../../utils/getProfileFaction.js';

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
          let profileFaction = playloadData.profileFaction ?? metaData.profileFaction ?? null;
          let profileFactionId = playloadData.profileFactionId ?? metaData.profileFactionId ?? null;
          let profileFactionAccount = playloadData.profileFactionAccount ?? metaData.profileFactionAccount ?? null;

          if (profileFaction == null && profileFactionId == null && !profileFactionAccount) {
            const resolvedFaction = await getProfileFactionUtil(profileId);
            profileFaction = resolvedFaction.profileFaction ?? profileFaction;
            profileFactionId = resolvedFaction.profileFactionId ?? profileFactionId;
            profileFactionAccount = resolvedFaction.profileFactionAccount ?? profileFactionAccount;
          }

          return {
            ...profile,
            profileFaction,
            profileFactionId,
            profileFactionAccount,
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
