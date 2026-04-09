import fs from 'node:fs/promises';
import path from 'node:path';

export type ProfileAnalysisLockRelease = () => Promise<void>;

function getLockFile(profileId: string) {
  const safeKey = Buffer.from(profileId || 'default').toString('hex');
  return path.join(process.cwd(), 'cache', '_profile_locks', `${safeKey}.analyze-profile.lock`);
}

function buildLockPayload(staleMs: number) {
  const now = Date.now();
  return JSON.stringify({
    pid: process.pid,
    updatedAt: now,
    expiresAt: now + staleMs,
  });
}

function isLockStale(rawLock: string | null, staleMs: number) {
  if (!rawLock) return true;
  try {
    const parsed = JSON.parse(rawLock);
    const expiresAt = Number(parsed?.expiresAt);
    const updatedAt = Number(parsed?.updatedAt);

    if (Number.isFinite(expiresAt)) {
      return Date.now() >= expiresAt;
    }
    if (Number.isFinite(updatedAt)) {
      return Date.now() >= (updatedAt + staleMs);
    }
    return true;
  } catch {
    return true;
  }
}

export async function acquireProfileAnalysisLock(
  profileId: string,
  opts?: { staleMs?: number }
): Promise<ProfileAnalysisLockRelease | null> {
  const staleMs = opts?.staleMs ?? 180_000;
  const lockFile = getLockFile(profileId);

  await fs.mkdir(path.dirname(lockFile), { recursive: true });

  const tryCreate = async () => {
    await fs.writeFile(lockFile, buildLockPayload(staleMs), { encoding: 'utf8', flag: 'wx' });
    return async () => {
      try {
        await fs.rm(lockFile, { force: true });
      } catch {
        // ignore release errors
      }
    };
  };

  try {
    return await tryCreate();
  } catch (e: any) {
    if (e?.code !== 'EEXIST') {
      throw e;
    }
  }

  try {
    const rawLock = await fs.readFile(lockFile, 'utf8');
    if (!isLockStale(rawLock, staleMs)) {
      return null;
    }
    await fs.rm(lockFile, { force: true });
  } catch {
    // another worker may have released or recreated the lock; retry once below
  }

  try {
    return await tryCreate();
  } catch (e: any) {
    if (e?.code === 'EEXIST') {
      return null;
    }
    throw e;
  }
}

export async function waitForProfileAnalysisLock(
  profileId: string,
  opts?: { timeoutMs?: number; pollMs?: number; staleMs?: number }
): Promise<{ release: ProfileAnalysisLockRelease | null; waitedMs: number }> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const pollMs = opts?.pollMs ?? 250;
  const staleMs = opts?.staleMs ?? 180_000;
  const start = Date.now();

  while ((Date.now() - start) <= timeoutMs) {
    const release = await acquireProfileAnalysisLock(profileId, { staleMs });
    if (release) {
      return { release, waitedMs: Date.now() - start };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return { release: null, waitedMs: Date.now() - start };
}
