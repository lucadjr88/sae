import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { findPlayerProfilesForWalletWithRpc } from '../../utils/derivePlayerProfilePDA';

export async function playerProfileIdHandler(req: Request, res: Response) {
  const wallet = req.query.wallet as string;
  if (!wallet) return res.status(400).json({ error: 'Missing wallet query parameter' });

  try {
    const walletPubkey = new PublicKey(wallet);
    // Pass undefined as rpcUrl to use healthy RPC selection
    const profiles = await findPlayerProfilesForWalletWithRpc(walletPubkey, undefined);
    return res.json({
      wallet,
      message: 'Player Profile account(s) found on-chain for wallet',
      variants: profiles
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to find player profile accounts' });
  }
}
