import { promises as fs } from 'fs';
import path from 'path';

const WHITELIST_CACHE: Map<string, { pubkeys: Set<string>; timestamp: number }> = new Map();
const CACHE_TTL_MS = 300000; // 5 minutes

async function loadFromEnv(): Promise<Set<string>> {
  const envWallets = process.env.ALLOWED_WALLETS;
  if (!envWallets) return new Set();
  return new Set(envWallets.split(',').map(w => w.trim()).filter(w => w.length > 0));
}

async function loadFromCache(profileId?: string): Promise<Set<string>> {
  if (!profileId) return new Set();

  try {
    const cacheFile = path.join(process.cwd(), 'cache', profileId, `${profileId}.json`);
    const raw = await fs.readFile(cacheFile, 'utf8');
    const meta = JSON.parse(raw);
    if (meta && Array.isArray(meta.allowedWallets)) {
      return new Set(meta.allowedWallets.map((w: any) => w.pubkey || w));
    }
  } catch (e) {
    // cache miss or parse error
  }

  return new Set();
}

async function loadFromRpc(profileId?: string): Promise<Set<string>> {
  if (!profileId) return new Set();

  try {
    const { getWalletAuthorityUtil } = await import('../getWalletAuthority.js');
    const result = await getWalletAuthorityUtil(profileId);
    if (result && Array.isArray(result.allowedWallets)) {
      return new Set(result.allowedWallets.map((w: any) => w.pubkey || w));
    }
  } catch (e) {
    console.warn(`[wallet-whitelist] RPC load failed for ${profileId}:`, e);
  }

  return new Set();
}

export async function isWalletAuthorized(pubkey: string, profileId?: string): Promise<boolean> {
  const whitelist = await getAuthorizedWallets(profileId);
  return whitelist.has(pubkey);
}

export async function getAuthorizedWallets(profileId?: string): Promise<Set<string>> {
  const cacheKey = profileId || '__global__';
  const cached = WHITELIST_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.pubkeys;
  }

  let wallets = new Set<string>();

  wallets = await loadFromEnv();
  if (wallets.size > 0) {
    WHITELIST_CACHE.set(cacheKey, { pubkeys: wallets, timestamp: Date.now() });
    return wallets;
  }

  if (profileId) {
    wallets = await loadFromCache(profileId);
    if (wallets.size > 0) {
      WHITELIST_CACHE.set(cacheKey, { pubkeys: wallets, timestamp: Date.now() });
      return wallets;
    }

    wallets = await loadFromRpc(profileId);
    if (wallets.size > 0) {
      WHITELIST_CACHE.set(cacheKey, { pubkeys: wallets, timestamp: Date.now() });
      return wallets;
    }
  }

  WHITELIST_CACHE.set(cacheKey, { pubkeys: new Set(), timestamp: Date.now() });
  return new Set();
}

export function clearWhitelistCache(profileId?: string): void {
  if (profileId) {
    WHITELIST_CACHE.delete(profileId);
  } else {
    WHITELIST_CACHE.clear();
  }
}
