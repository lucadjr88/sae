import fs from 'fs/promises';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';


const PLAYER_PROFILE_PROGRAM_ID = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';
const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');
let rawPoolCursor = 0;

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
  let lastError: unknown = null;
  try {
    console.log('[findPlayerProfilesForWalletWithRpc] Start for wallet:', wallet.toBase58());
    const raw = await fs.readFile(RPC_POOL_COMPLETE, 'utf8');
    const endpoints = JSON.parse(raw)
      .map((ep: any) => ep?.url)
      .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0);
    const uniqueEndpoints: string[] = Array.from(new Set(endpoints));
    const candidates: string[] = rpcUrl ? [rpcUrl, ...uniqueEndpoints.filter((url) => url !== rpcUrl)] : uniqueEndpoints;
    const maxAttempts = Math.max(1, candidates.length);
    const programPubkey = new PublicKey(PLAYER_PROFILE_PROGRAM_ID);

    if (candidates.length === 0) {
      throw new Error('No RPC endpoints configured in utility/rpc-pool-complete.json');
    }

    const startIndex = rawPoolCursor % candidates.length;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const index = (startIndex + attempt) % candidates.length;
      const selectedUrl = candidates[index];
      const connection = new Connection(selectedUrl, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      });
      try {
        console.log('[findPlayerProfilesForWalletWithRpc] Selected RPC:', selectedUrl);
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
        rawPoolCursor = (index + 1) % candidates.length;
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
        lastError = e;
        console.log(`[findPlayerProfilesForWalletWithRpc] Attempt ${attempt + 1}/${maxAttempts} failed on ${selectedUrl}:`, (e as any)?.message || e);
      }
    }

    throw lastError ?? new Error('All RPC endpoints failed for player profile search');
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
