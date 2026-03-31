import { PublicKey, Connection } from '@solana/web3.js';


const PLAYER_PROFILE_PROGRAM_ID = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';

type ProfilePDAVariant = {
  label: string;
  description: string;
  profileId: string;
  source: string;
};

// Find player profile by searching on-chain for accounts containing wallet as owner/authority
  const variants: ProfilePDAVariant[] = [];
  //return await findPlayerProfilesForWalletWithRpc(wallet, undefined, undefined);
//}

// Best practice: pass rpcUrl as parameter
export async function findPlayerProfilesForWalletWithRpc(wallet: PublicKey, rpcUrl?: string, profileId?: string): Promise<ProfilePDAVariant[]> {
  const variants: ProfilePDAVariant[] = [];
  try {
    console.log('[findPlayerProfilesForWalletWithRpc] Start for wallet:', wallet.toBase58());
    let rpcToUse = rpcUrl;
    if (!rpcToUse) {
      const { getSingleHealthyRpc } = await import('./rpc/singleRpcManager');
      rpcToUse = await getSingleHealthyRpc();
    }
    console.log('[findPlayerProfilesForWalletWithRpc] Selected RPC:', rpcToUse);
    if (!rpcToUse) {
      console.log('[findPlayerProfilesForWalletWithRpc] No healthy RPC endpoint found');
      return [{
        label: 'error',
        description: 'No healthy RPC endpoint found',
        profileId: '',
        source: 'rpc selection failed'
      }];
    }
    const connection = new Connection(rpcToUse, 'confirmed');
    const programPubkey = new PublicKey(PLAYER_PROFILE_PROGRAM_ID);
    const walletBuffer = wallet.toBuffer();
    console.log('[findPlayerProfilesForWalletWithRpc] Calling getProgramAccounts with filter:', {
      programId: programPubkey.toBase58(),
      offset: 30,
      wallet: wallet.toBase58()
    });
    const accountsWithWallet = await connection.getProgramAccounts(programPubkey, {
      filters: [
        {
          memcmp: {
            offset: 30, // ProfileKey array starts at offset 30
            bytes: wallet.toBase58()
          }
        }
      ],
      commitment: 'confirmed'
    });
    console.log('[findPlayerProfilesForWalletWithRpc] getProgramAccounts result count:', accountsWithWallet.length);
    if (accountsWithWallet.length > 0) {
      accountsWithWallet.forEach((acc, idx) => {
        console.log(`[findPlayerProfilesForWalletWithRpc] Found profile ${idx + 1}:`, acc.pubkey.toBase58());
        variants.push({
          label: `profile_found_${idx + 1}`,
          description: `Profile account found containing wallet ${wallet.toBase58()} in data`,
          profileId: acc.pubkey.toBase58(),
          source: 'on-chain search at offset 30'
        });
      });
    }
    if (variants.length === 0) {
      console.log('[findPlayerProfilesForWalletWithRpc] No player profile found for this wallet on-chain');
      variants.push({
        label: 'not_found',
        description: 'No player profile found for this wallet on-chain',
        profileId: '',
        source: 'on-chain search returned empty'
      });
    }
    return variants;
  } catch (e) {
    console.log('[findPlayerProfilesForWalletWithRpc] Error:', (e as any)?.message || e);
    return [{
      label: 'error',
      description: `Error searching for profiles: ${(e as any)?.message || 'Unknown error'}`,
      profileId: '',
      source: 'search failed'
    }];
  }
}
