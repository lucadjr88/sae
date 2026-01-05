import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

/**
 * Normalize profileId for safe filesystem usage.
 * - Strip slashes
 * - Allow [A-Za-z0-9_-]
 * - Hash if invalid chars or empty
 */
export function normalizeProfileId(profileId: string): string {
  if (!profileId || typeof profileId !== 'string') {
    return crypto.createHash('sha256').update('default').digest('hex');
  }
  const stripped = profileId.replace(/\//g, '').replace(/\\/g, '');
  if (/^[A-Za-z0-9_-]+$/.test(stripped) && stripped.length > 0) {
    return stripped;
  }
  return crypto.createHash('sha256').update(profileId).digest('hex');
}

/**
 * Get cache paths for a profile.
 * Anchor cache root to repo root regardless of process.cwd
 */
export function cachePath(profileId: string) {
  const normalized = normalizeProfileId(profileId);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const root = path.join(repoRoot, 'cache', normalized);
  return {
    root,
    file: (name: string) => path.join(root, name)
  };
}