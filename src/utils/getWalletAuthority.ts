import { fetchSolanaAccountInfo } from './fetchSolanaAccountInfo.js';
import bs58 from 'bs58';
import { promises as fs } from 'fs';
import path from 'path';

// Estrae tutte le chiavi (allowed wallets) e salva in cache come da flusso
export async function getWalletAuthorityUtil(profileId: string): Promise<{allowedWallets: {index: number, pubkey: string, scope: string, permissions: string}[]}> {
  const buf = await fetchSolanaAccountInfo(profileId);
  if (!buf || buf.length < 30) return { allowedWallets: [] };
  const discriminator = Buffer.from([184,101,165,188,95,63,127,188]);
  if (!buf.slice(0,8).equals(discriminator)) return { allowedWallets: [] };
  const numKeys = buf.readUInt16LE(28);
  let offset = 30;
  const allowedWallets = [];
  for (let i = 0; i < numKeys; i++) {
    const key = buf.slice(offset, offset+32);
    const permissions = buf.slice(offset+72, offset+80);
    const scope = buf.slice(offset+32, offset+64);
    allowedWallets.push({
      index: i,
      pubkey: bs58.encode(key),
      scope: bs58.encode(scope),
      permissions: permissions.toString('hex')
    });
    offset += 32+32+8+8;
  }
  // Salva in cache/<PROFILEID>/<PROFILEID>.json
  const cacheDir = path.join('cache', profileId);
  const cacheFile = path.join(cacheDir, `${profileId}.json`);
  await fs.mkdir(cacheDir, { recursive: true });
  let meta: any = {};
  try {
    meta = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {}
  meta.allowedWallets = allowedWallets;
  await fs.writeFile(cacheFile, JSON.stringify(meta, null, 2));
  return { allowedWallets };
}
