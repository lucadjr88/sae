import fs from 'fs/promises';
import path from 'path';
function getCacheDir(profileId, namespace) {
    return path.join(process.cwd(), 'cache', profileId, namespace);
}
function getCacheFile(profileId, namespace, key) {
    return path.join(getCacheDir(profileId, namespace), `${key}.json`);
}
export async function setCache(namespace, key, data, profileId) {
    const dir = getCacheDir(profileId, namespace);
    await fs.mkdir(dir, { recursive: true });
    const file = getCacheFile(profileId, namespace, key);
    await fs.writeFile(file, JSON.stringify({ savedAt: Date.now(), data }), 'utf8');
}
export async function getCache(namespace, key, profileId) {
    const file = getCacheFile(profileId, namespace, key);
    try {
        const raw = await fs.readFile(file, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
