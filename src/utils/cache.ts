import fs from 'fs/promises';
import path from 'path';

function getCacheDir(profileId: string, namespace: string) {
  return path.join(process.cwd(), 'cache', profileId, namespace);
}

function getCacheFile(profileId: string, namespace: string, key: string) {
  return path.join(getCacheDir(profileId, namespace), `${key}.json`);
}

export async function setCache(namespace: string, key: string, data: any, profileId: string) {
  const dir = getCacheDir(profileId, namespace);
  await fs.mkdir(dir, { recursive: true });
  const file = getCacheFile(profileId, namespace, key);
  await fs.writeFile(file, JSON.stringify({ savedAt: Date.now(), data }), 'utf8');
}

export async function getCache(namespace: string, key: string, profileId: string) {
  const file = getCacheFile(profileId, namespace, key);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
