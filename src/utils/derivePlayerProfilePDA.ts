import fs from 'fs/promises';
import path from 'path';
import type { Dirent } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { updatePlayerProfileRpcStats } from './rpc/prune.js';
import { getRpcConnectionWithUrl } from './rpc/connection.js';

const PLAYER_PROFILE_PROGRAM_ID = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';
const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/g, '<rpc-url>');
}

type ProfilePDAVariant = {
  label: string;
  description: string;
  profileId: string;
  source: string;
};

async function findCachedProfileMatches(wallet: PublicKey): Promise<ProfilePDAVariant[]> {
  const cacheRoot = path.join(process.cwd(), 'cache');
  let entries: Dirent[];
  try {
    entries = await fs.readdir(cacheRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[findPlayerProfilesForWalletWithRpc] Cannot read profile cache:', errorMessage(error));
    }
    return [];
  }

  const matches: ProfilePDAVariant[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let profileId: string;
    try {
      profileId = new PublicKey(entry.name).toBase58();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[findPlayerProfilesForWalletWithRpc] Cannot read cached profile ${profileId}:`, errorMessage(error));
      }
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(cacheRoot, profileId, `${profileId}.json`), 'utf8');
      const metadata = JSON.parse(raw);
      if (!Array.isArray(metadata?.allowedWallets)) continue;
      if (!metadata.allowedWallets.some((key: any) => key?.pubkey === wallet.toBase58())) continue;
      matches.push({
        label: `cached_profile_found_${matches.length + 1}`,
        description: `Cached profile authority contains wallet ${wallet.toBase58()}`,
        profileId,
        source: 'cached profile authority',
      });
    } catch {
      continue;
    }
  }
  return matches;
}

export async function findPlayerProfilesForWalletWithRpc(wallet: PublicKey, rpcUrl?: string, profileId?: string): Promise<ProfilePDAVariant[]> {
  const variants: ProfilePDAVariant[] = [];
  let searchError: string | null = null;
  try {
    console.log('[findPlayerProfilesForWalletWithRpc] Start for wallet:', wallet.toBase58());
    let endpointsRaw: any = [];
    try {
      const raw = await fs.readFile(RPC_POOL_COMPLETE, 'utf8');
      endpointsRaw = JSON.parse(raw);
    } catch {
      endpointsRaw = [{ name: 'Default RPC', url: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com' }];
    }
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
    const candidates: string[] = rpcUrl
      ? [rpcUrl, ...uniqueEndpoints.filter((url) => url !== rpcUrl)]
      : uniqueEndpoints;
    const programAccountCandidates = candidates.filter((url) => !url.includes('gateway.tatum.io'));
    const effectiveCandidates = programAccountCandidates.length > 0 ? programAccountCandidates : candidates;
    const maxAttempts = Math.max(1, effectiveCandidates.length);
    const programPubkey = new PublicKey(PLAYER_PROFILE_PROGRAM_ID);

    if (effectiveCandidates.length === 0) {
      throw new Error('No RPC endpoints configured in utility/rpc-pool-complete.json');
    }

    let searchSucceeded = false;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const selectedUrl = effectiveCandidates[attempt];
      try {
        const endpoint = endpointObjs.find((ep: any) => ep.url === selectedUrl);
        const { connection } = await getRpcConnectionWithUrl({
          rpcUrl: selectedUrl,
          commitment: 'confirmed',
          headers: endpoint?.headers,
        });
        console.log('[findPlayerProfilesForWalletWithRpc] Selected RPC host:', new URL(selectedUrl).host);
        console.log('[findPlayerProfilesForWalletWithRpc] Scanning profile key entries:', {
          programId: programPubkey.toBase58(),
          wallet: wallet.toBase58(),
        });
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let accountsWithWallet: Awaited<ReturnType<typeof connection.getProgramAccounts>>;
        try {
          accountsWithWallet = await Promise.race([
            connection.getProgramAccounts(programPubkey, { commitment: 'confirmed' }),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('getProgramAccounts timeout')), 5000);
            })
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        await updatePlayerProfileRpcStats(selectedUrl, true);
        for (const account of accountsWithWallet) {
          const data = Buffer.from(account.account.data);
          if (data.length < 30) continue;
          const keyCount = data.readUInt16LE(28);
          const availableKeyCount = Math.min(keyCount, Math.floor((data.length - 30) / 80));
          let foundWallet = false;
          for (let keyIndex = 0; keyIndex < availableKeyCount; keyIndex += 1) {
            const keyOffset = 30 + keyIndex * 80;
            if (data.subarray(keyOffset, keyOffset + 32).equals(wallet.toBuffer())) {
              foundWallet = true;
              break;
            }
          }
          if (foundWallet) {
            const profileId = account.pubkey.toBase58();
            console.log('[findPlayerProfilesForWalletWithRpc] Found profile:', profileId);
            variants.push({
              label: `profile_found_${variants.length + 1}`,
              description: `Profile account contains wallet ${wallet.toBase58()} in its ProfileKey entries`,
              profileId,
              source: 'on-chain ProfileKey scan',
            });
          }
        }
        console.log('[findPlayerProfilesForWalletWithRpc] Matching profiles:', variants.length);
        if (variants.length > 0) {
          return variants;
        }
        searchSucceeded = true;
        break;
      } catch (e) {
        await updatePlayerProfileRpcStats(selectedUrl, false);
        console.warn(`[findPlayerProfilesForWalletWithRpc] Attempt ${attempt + 1}/${maxAttempts} failed:`, errorMessage(e));
      }
    }

    if (!searchSucceeded) throw new Error('All RPC endpoints failed for player profile search');
    console.log('[findPlayerProfilesForWalletWithRpc] On-chain search returned no profiles');
  } catch (e) {
    searchError = errorMessage(e);
    console.warn('[findPlayerProfilesForWalletWithRpc] On-chain search failed:', searchError);
  }

  const cachedProfiles = await findCachedProfileMatches(wallet);
  if (cachedProfiles.length) {
    console.log('[findPlayerProfilesForWalletWithRpc] Using cached profiles:', cachedProfiles.map(profile => profile.profileId));
    return cachedProfiles;
  }
  console.log('[findPlayerProfilesForWalletWithRpc] No cached profiles found');
  if (searchError) {
    return [{
      label: 'error',
      description: `Error searching for profiles: ${searchError}`,
      profileId: '',
      source: 'search failed'
    }];
  }
  return [];
}
