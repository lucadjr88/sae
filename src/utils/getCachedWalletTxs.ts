import fs from 'fs/promises';
import path from 'path';
import { normalizeRawTx } from './normalizeRawTx';

// Legge tutte le transazioni raw dalla cache per un wallet/profileId
export async function getCachedWalletTxs(wallet: string, profileId: string): Promise<any[]> {
  const dir = path.join(process.cwd(), 'cache', profileId, 'wallet-txs', wallet);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const txs: any[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.data) txs.push({ raw: parsed.data, norm: normalizeRawTx(parsed.data) });
    } catch {}
  }
  return txs;
}
