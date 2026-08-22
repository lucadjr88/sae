import fs from 'fs/promises';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager.js';

const PROFILE_FACTION_PROGRAM_ID = new PublicKey('pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq');
const PROFILE_MEMCMP_OFFSETS = [9, 8] as const;

function normalizeRpcProfileId(value?: string | null): string {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  return cleaned.length > 0 ? cleaned : 'default';
}

const FACTION_BY_ID = {
  0: 'unaligned',
  1: 'mud',
  2: 'oni',
  3: 'ustur',
} as const;

export type ProfileFactionName = (typeof FACTION_BY_ID)[keyof typeof FACTION_BY_ID] | null;

export interface ProfileFactionResult {
  profileFactionAccount: string | null;
  profileFactionId: number | null;
  profileFaction: ProfileFactionName;
}

function getRpcErrorType(error: unknown): '429' | '503' | 'error' {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (status === 429 || /429|Too Many Requests/i.test(message)) return '429';
  if (status === 503 || /503|Service Unavailable/i.test(message)) return '503';
  return 'error';
}

async function persistProfileFaction(profileId: string, patch: ProfileFactionResult): Promise<void> {
  const cacheDir = path.join(process.cwd(), 'cache', profileId);
  const cacheFile = path.join(cacheDir, `${profileId}.json`);

  let meta: any = {};
  try {
    meta = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    meta = {};
  }

  const currentMeta = meta?.data || meta || {};
  const nextMeta = { ...currentMeta, ...patch };

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(nextMeta, null, 2), 'utf8');
}

async function loadCachedProfileFaction(profileId: string): Promise<ProfileFactionResult | null> {
  const cacheFile = path.join(process.cwd(), 'cache', profileId, `${profileId}.json`);

  try {
    const raw = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    const meta = raw?.data || raw || {};
    const profileFactionId = typeof meta.profileFactionId === 'number' ? meta.profileFactionId : null;
    const profileFaction = typeof meta.profileFaction === 'string' ? meta.profileFaction : null;
    const profileFactionAccount = typeof meta.profileFactionAccount === 'string' ? meta.profileFactionAccount : null;

    if (!profileFaction && profileFactionId === null && !profileFactionAccount) {
      return null;
    }

    return {
      profileFaction,
      profileFactionId,
      profileFactionAccount,
    };
  } catch {
    return null;
  }
}

async function executeRpcWithPool<T>(profileId: string, operation: (connection: any) => Promise<T>): Promise<T> {
  const normalizedProfileId = normalizeRpcProfileId(profileId);
  const pool = await RpcPoolManager.loadOrCreateRpcPool(normalizedProfileId);
  const maxAttempts = Math.max(4, Math.round(pool.length * 1.5));
  let lastError: unknown = null;
  const failedRpcUrls = new Set<string>();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | null = null;
    const startedAt = Date.now();

    try {
      pick = await RpcPoolManager.pickRpcConnection(normalizedProfileId, {
        waitForMs: 3000,
        allowStale: attempt > 2,
        excludeUrls: failedRpcUrls,
      });
      const result = await operation(pick.connection);
      pick.release({ success: true, latencyMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      if (pick) {
        pick.release({
          success: false,
          latencyMs: Date.now() - startedAt,
          errorType: getRpcErrorType(error),
        });
      }
      const rpcName = pick?.endpoint?.name ?? 'unknown';
      const rpcUrl = pick?.endpoint?.url ?? 'n/a';
      if (pick?.endpoint?.url) failedRpcUrls.add(pick.endpoint.url);
      lastError = error;
      console.warn(`[getProfileFactionUtil] attempt ${attempt + 1}/${maxAttempts} failed for profile ${normalizedProfileId} | rpc=${rpcName} | url=${rpcUrl}:`, error);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('RPC request failed');
}

export async function getProfileFactionUtil(profileId: string): Promise<ProfileFactionResult> {
  const emptyResult: ProfileFactionResult = {
    profileFactionAccount: null,
    profileFactionId: null,
    profileFaction: null,
  };

  try {
    const profilePk = new PublicKey(profileId);

    const accounts = await executeRpcWithPool(profileId, async (connection) => {
      for (const offset of PROFILE_MEMCMP_OFFSETS) {
        const found = await connection.getProgramAccounts(PROFILE_FACTION_PROGRAM_ID, {
          filters: [{ memcmp: { offset, bytes: profilePk.toBase58() } }],
          commitment: 'confirmed',
        });
        if (found.length > 0) {
          return found;
        }
      }
      return [];
    });

    if (!Array.isArray(accounts) || accounts.length === 0) {
      await persistProfileFaction(profileId, emptyResult);
      return emptyResult;
    }

    const account = accounts[0];
    const rawData = Buffer.from(account.account.data);
    const profileFactionId = rawData.length >= 2 ? Number(rawData[rawData.length - 2]) : null;
    const profileFaction = typeof profileFactionId === 'number'
      ? (FACTION_BY_ID[profileFactionId as keyof typeof FACTION_BY_ID] ?? null)
      : null;

    const result: ProfileFactionResult = {
      profileFactionAccount: account.pubkey.toBase58(),
      profileFactionId,
      profileFaction,
    };

    await persistProfileFaction(profileId, result);
    return result;
  } catch (error) {
    console.log('[getProfileFactionUtil] Error:', error);
    const cached = await loadCachedProfileFaction(profileId);
    return cached ?? emptyResult;
  }
}
