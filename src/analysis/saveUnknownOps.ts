import { setCache } from '../utils/cache';

export async function saveUnknownOps(profileId: string, unknownOps: any[]) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'cache', profileId, 'unknown');
  await fs.mkdir(dir, { recursive: true });
  for (const op of unknownOps) {
    const signature = op.signature;
    if (!signature) continue;
    const file = path.join(dir, `${signature}.json`);
    await fs.writeFile(file, JSON.stringify(op, null, 2), 'utf8');
  }
}
