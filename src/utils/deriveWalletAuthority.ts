import { promises as fs } from 'fs';
import path from 'path';
import { getWalletAuthorityUtil } from './getWalletAuthority';

// Deriva wallet authority da cache o RPC (fallback)
export async function deriveWalletAuthority(fleets: any[], profileId: string) {
  const cacheFile = path.join(process.cwd(), 'cache', profileId, `${profileId}.json`);
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const meta = JSON.parse(raw);
    if (meta && meta.walletAuthority) return meta.walletAuthority;
    if (meta && Array.isArray(meta.allowedWallets) && meta.allowedWallets.length) {
      return meta.allowedWallets[0].pubkey;
    }
  } catch (e) {
    // ignore, fallback to RPC
  }

  try {
    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    if (allowedWallets && allowedWallets.length) return allowedWallets[0].pubkey;
  } catch (e) {
    // ignore
  }

  return null;
}

