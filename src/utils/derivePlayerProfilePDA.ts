import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager';

const PLAYER_PROFILE_PROGRAM_ID = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';

type ProfilePDAVariant = {
  label: string;
  description: string;
  profileId: string;
  source: string;
};

// Find player profile by searching on-chain for accounts containing wallet as owner/authority
export async function findPlayerProfilesForWallet(wallet: PublicKey, profileId?: string): Promise<ProfilePDAVariant[]> {
  const variants: ProfilePDAVariant[] = [];
  let pick: any = null;

  try {
    pick = await RpcPoolManager.pickRpcConnection(profileId || wallet.toBase58(), { waitForMs: 3000 });
    const { connection, release } = pick;

    // Get all accounts owned by the Player Profile program
    const programPubkey = new PublicKey(PLAYER_PROFILE_PROGRAM_ID);
    const walletBuffer = wallet.toBuffer();

    // Search for profiles containing the wallet in data
    // Offset varies based on position in profile struct
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

    if (accountsWithWallet.length > 0) {
      accountsWithWallet.forEach((acc, idx) => {
        variants.push({
          label: `profile_found_${idx + 1}`,
          description: `Profile account found containing wallet ${wallet.toBase58()} in data`,
          profileId: acc.pubkey.toBase58(),
          source: 'on-chain search at offset 30'
        });
      });
    }

    release({ success: true });

    if (variants.length === 0) {
      variants.push({
        label: 'not_found',
        description: 'No player profile found for this wallet on-chain',
        profileId: '',
        source: 'on-chain search returned empty'
      });
    }

    return variants;
  } catch (e) {
    return [{
      label: 'error',
      description: `Error searching for profiles: ${(e as any)?.message || 'Unknown error'}`,
      profileId: '',
      source: 'search failed'
    }];
  }
}
