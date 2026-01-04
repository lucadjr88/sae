import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';


const ROOT = path.join(process.cwd(), '..', 'cache');

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


export async function getCache<T = any>(namespace: string, key: string): Promise<T | null> {
  const nsDir = path.join(ROOT, namespace);
  const file = getCacheFilename(nsDir, key);
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch {
    return null;
  }
}


export async function setCache(namespace: string, key: string, data: any): Promise<void> {
  const nsDir = path.join(ROOT, namespace);
  await ensureDir(nsDir);
  const file = getCacheFilename(nsDir, key);
  const payload = {
    savedAt: Date.now(),
    data
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
}

export async function getCacheDataOnly<T = any>(namespace: string, key: string): Promise<T | null> {
  const raw = await getCache(namespace, key);
  // If caller expects only the data field
  // Accept both legacy plain-data and wrapped {savedAt,data}
  if (!raw) return null;
  if (typeof raw === 'object' && raw && 'data' in (raw as any)) return (raw as any).data as T;
  return raw as T;
}

export async function getCacheWithTimestamp<T = any>(namespace: string, key: string): Promise<{ data: T; savedAt: number } | null> {
  const raw = await getCache(namespace, key);
  if (!raw) return null;
  if (typeof raw === 'object' && raw && 'data' in (raw as any) && 'savedAt' in (raw as any)) {
    return { data: (raw as any).data as T, savedAt: (raw as any).savedAt };
  }
  // Legacy: no timestamp
  return { data: raw as T, savedAt: 0 };
}
