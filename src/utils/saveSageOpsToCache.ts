import fs from 'fs/promises';
import path from 'path';

export async function saveSageOpsToCache(profileId: string, sageOps: any[]) {
  const dir = path.join(process.cwd(), 'cache', profileId, 'sage-ops');
  await fs.mkdir(dir, { recursive: true });
  for (const op of sageOps) {
    // Usa op.signature come nome file, se non c'è salta
    const signature = op.signature;
    if (!signature) continue;
    const file = path.join(dir, `${signature}.json`);
    await fs.writeFile(file, JSON.stringify(op, null, 2), 'utf8');
  }
  return dir;
}
