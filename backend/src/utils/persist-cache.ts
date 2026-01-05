import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { cachePath } from './cache-path.js';

// Anchor cache root to repo root regardless of process.cwd
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cache');
const DEFAULT_PROFILE_ID = 'default';

// Simple mutex per profile
const profileMutexes = new Map<string, Promise<any>>();

async function withProfileMutex<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
  const key = profileId;
  while (profileMutexes.has(key)) {
    await profileMutexes.get(key);
  }
  const promise = fn().finally(() => profileMutexes.delete(key));
  profileMutexes.set(key, promise);
  return promise;
}

export { DEFAULT_PROFILE_ID };

// Ensure the profile cache directory exists
export async function ensureProfileCacheDir(profileId: string): Promise<void> {
  await ensureDir(cachePath(profileId).root);
}

// Helper to sanitize cache keys for filenames (hash if not a simple signature)
function getCacheFilename(dir: string, key: string) {
  // Use the key directly if it's a simple signature (base58, 43-88 chars, alphanumeric)
  // Otherwise, hash the key to avoid ENAMETOOLONG
  const isSimpleSig = /^[A-Za-z0-9]{43,88}$/.test(key);
  let filename;
  if (isSimpleSig) {
    filename = key;
  } else {
    // Hash the key to avoid long filenames
    filename = crypto.createHash('sha256').update(key).digest('hex');
  }
  return path.join(dir, filename + '.json');
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}


export async function getCache<T = any>(profileId: string, namespace: string, key: string): Promise<T | null> {
  const nsDir = cachePath(profileId).file(namespace);
  const file = getCacheFilename(nsDir, key);
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch {
    // Check for legacy flat structure
    if (profileId === DEFAULT_PROFILE_ID) {
      const legacyNsDir = path.join(ROOT, namespace);
      const legacyFile = getCacheFilename(legacyNsDir, key);
      try {
        const buf = await fs.readFile(legacyFile, 'utf8');
        console.log(`[cache] Migrating legacy cache for ${namespace}/${key} to profile-scoped`);
        // Move to new location
        await ensureDir(nsDir);
        await fs.rename(legacyFile, file);
        return JSON.parse(buf) as T;
      } catch {
        // No legacy file
      }
    }
    return null;
  }
}


export async function setCache(profileId: string, namespace: string, key: string, data: any): Promise<void> {
  return withProfileMutex(profileId, async () => {
    const nsDir = cachePath(profileId).file(namespace);
    await ensureDir(nsDir);
    const file = getCacheFilename(nsDir, key);
    const payload = {
      savedAt: Date.now(),
      data
    };
    // Atomic write: write to tmp then rename
    const tmpFile = file + '.tmp';
    await fs.writeFile(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpFile, file);
  });
}

export async function getCacheDataOnly<T = any>(profileId: string, namespace: string, key: string): Promise<T | null> {
  const raw = await getCache(profileId, namespace, key);
  // If caller expects only the data field
  // Accept both legacy plain-data and wrapped {savedAt,data}
  if (!raw) return null;
  if (typeof raw === 'object' && raw && 'data' in (raw as any)) return (raw as any).data as T;
  return raw as T;
}

export async function getCacheWithTimestamp<T = any>(profileId: string, namespace: string, key: string): Promise<{ data: T; savedAt: number } | null> {
  const raw = await getCache(profileId, namespace, key);
  if (!raw) return null;
  if (typeof raw === 'object' && raw && 'data' in (raw as any) && 'savedAt' in (raw as any)) {
    return { data: (raw as any).data as T, savedAt: (raw as any).savedAt };
  }
  // Legacy: no timestamp
  return { data: raw as T, savedAt: 0 };
}
