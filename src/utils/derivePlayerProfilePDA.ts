import fs from 'fs/promises';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { updatePlayerProfileRpcStats } from './rpc/prune.js';
import { getRpcConnectionWithUrl } from './rpc/connection.js';

const PLAYER_PROFILE_PROGRAM_ID = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';
const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');

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
    let endpointsRaw = JSON.parse(raw);
    // Ordina per rapporto plrProfile_success/plrProfile_total decrescente
    let endpointObjs: any[] = [];
    if (Array.isArray(endpointsRaw)) {
      endpointObjs = endpointsRaw.filter((ep: any) => ep && typeof ep.url === 'string');
    } else if (endpointsRaw && typeof endpointsRaw === 'object') {
      endpointObjs = Object.values(endpointsRaw).filter((ep: any) => ep && typeof ep.url === 'string');
    }
    endpointObjs.sort((a, b) => {
      const aTotal = a.plrProfile_total || 0;
      const bTotal = b.plrProfile_total || 0;
      const aRatio = aTotal > 0 ? (a.plrProfile_success || 0) / aTotal : -1;
      const bRatio = bTotal > 0 ? (b.plrProfile_success || 0) / bTotal : -1;
      if (bRatio !== aRatio) return bRatio - aRatio;
      return bTotal - aTotal;
    });
    const orderedEndpoints: string[] = endpointObjs.map((ep: any) => ep.url);
    const uniqueEndpoints: string[] = Array.from(new Set(orderedEndpoints));
    const candidates: string[] = rpcUrl ? [rpcUrl, ...uniqueEndpoints.filter((url) => url !== rpcUrl)] : uniqueEndpoints;
    const maxAttempts = Math.max(1, candidates.length);
    const programPubkey = new PublicKey(PLAYER_PROFILE_PROGRAM_ID);

    if (candidates.length === 0) {
      throw new Error('No RPC endpoints configured in utility/rpc-pool-complete.json');
    }

    const startIndex = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const index = (startIndex + attempt) % candidates.length;
      const selectedUrl = candidates[index];
      const { connection } = await getRpcConnectionWithUrl({
  rpcUrl: selectedUrl,
  commitment: 'confirmed'
});
      try {
        console.log('[findPlayerProfilesForWalletWithRpc] Selected RPC:', selectedUrl);
        console.log('[findPlayerProfilesForWalletWithRpc] Calling getProgramAccounts with filter:', {
          programId: programPubkey.toBase58(),
          offset: 30,
          wallet: wallet.toBase58()
        });
        let accountsWithWallet: Awaited<ReturnType<typeof connection.getProgramAccounts>> = [];
        let respondedInTime = true;
        try {
          accountsWithWallet = await Promise.race([
            connection.getProgramAccounts(programPubkey, {
              filters: [
                {
                  memcmp: {
                    offset: 30, // ProfileKey array starts at offset 30
                    bytes: wallet.toBase58()
                  }
                }
              ],
              commitment: 'confirmed'
            }),
            new Promise((_, reject) => setTimeout(() => {
              respondedInTime = false;
              reject(new Error('getProgramAccounts timeout'));
            }, 5000))
          ]) as Awaited<ReturnType<typeof connection.getProgramAccounts>>;
        } catch (timeoutErr) {
          respondedInTime = false;
          accountsWithWallet = [];
        }
        // Aggiorna solo le stats, la logica di retry rimane invariata
        await updatePlayerProfileRpcStats(selectedUrl, respondedInTime);
        if (respondedInTime) {
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
            return variants;
          }
        }
        // Se non trovato o timeout, continua con il prossimo endpoint
      } catch (e) {
        await updatePlayerProfileRpcStats(selectedUrl, false);
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
