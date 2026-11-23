import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ProfileAnalysisLockRelease = () => Promise<void>;

function getLockFile(profileId: string) {
  const safeKey = Buffer.from(profileId || 'default').toString('hex');
  return path.join(process.cwd(), 'cache', '_profile_locks', `${safeKey}.analyze-profile.lock`);
}

function buildLockPayload(staleMs: number, owner: string) {
  const now = Date.now();
  return JSON.stringify({
    pid: process.pid,
    owner,
    updatedAt: now,
    expiresAt: now + staleMs,
  });
}

function isLockStale(rawLock: string, staleMs: number, modifiedAt: number) {
  if (!rawLock) return Date.now() >= modifiedAt + staleMs;
  try {
    const parsed = JSON.parse(rawLock);
    const pid = Number(parsed?.pid);
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM') return false;
        if (code !== 'ESRCH') throw error;
      }
    }
    const expiresAt = Number(parsed?.expiresAt);
    const updatedAt = Number(parsed?.updatedAt);

    if (Number.isFinite(expiresAt)) {
      return Date.now() >= expiresAt;
    }
    if (Number.isFinite(updatedAt)) {
      return Date.now() >= (updatedAt + staleMs);
    }
    return true;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return Date.now() >= modifiedAt + staleMs;
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
    const owner = randomUUID();
    await fs.writeFile(lockFile, buildLockPayload(staleMs, owner), { encoding: 'utf8', flag: 'wx' });
    return async () => {
      try {
        const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
        if (lock.owner === owner) await fs.rm(lockFile, { force: true });
        else console.warn(`[profile-analysis-lock] Lock ownership changed for profile=${profileId}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
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
    const stat = await fs.stat(lockFile);
    if (!isLockStale(rawLock, staleMs, stat.mtimeMs)) {
      return null;
    }
    await fs.rm(lockFile, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
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
