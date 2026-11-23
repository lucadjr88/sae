import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

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

export async function setCacheAtomic(namespace: string, key: string, data: any, profileId: string) {
  const dir = getCacheDir(profileId, namespace);
  await fs.mkdir(dir, { recursive: true });
  const file = getCacheFile(profileId, namespace, key);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ savedAt: Date.now(), data }), 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    try {
      await fs.rm(temporary, { force: true });
    } catch (cleanupError) {
      console.warn(`[cache] Failed to remove temporary file ${temporary}:`, cleanupError);
    }
    throw error;
  }
}

export async function getCacheStrict(namespace: string, key: string, profileId: string) {
  const file = getCacheFile(profileId, namespace, key);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[cache] Invalid JSON in ${file}:`, error);
    return null;
  }
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
