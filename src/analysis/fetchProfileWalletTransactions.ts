import { getWalletAuthorityUtil } from '../utils/getWalletAuthority.js';
import { getWalletTxsUtil } from '../utils/getWalletTxs.js';
import { RpcPoolManager } from '../utils/rpc/rpc-pool-manager.js';

export type ProfileWalletTransactionsResult =
  | { ok: true; profileId: string; cutoffH: number; results: Array<{ wallet: string; txCount: number }>; walletSignatures: Record<string, string[]> }
  | { ok: false; error: 'No allowed wallets found' };

export async function fetchProfileWalletTransactions(
  profileId: string,
  cutoffH: number,
): Promise<ProfileWalletTransactionsResult> {
  try {
    await RpcPoolManager.ensurePool(profileId, false);
  } catch (error) {
    console.warn('[get-wallet-txs] ensurePool failed:', error instanceof Error ? error.message : error);
  }

  const { allowedWallets } = await getWalletAuthorityUtil(profileId);
  if (!allowedWallets || allowedWallets.length === 0) {
    return { ok: false, error: 'No allowed wallets found' };
  }

  const seen = new Set<string>();
  const results: Array<{ wallet: string; txCount: number }> = [];
  const walletSignatures: Record<string, string[]> = {};
  for (const wallet of allowedWallets) {
    if (seen.has(wallet.pubkey)) continue;
    seen.add(wallet.pubkey);
    console.log(`[get-wallet-txs] profileId=${profileId} wallet=${wallet.pubkey} cutoffH=${cutoffH}`);

    let result: Awaited<ReturnType<typeof getWalletTxsUtil>>;
    try {
      result = await getWalletTxsUtil(wallet.pubkey, cutoffH, profileId);
    } catch (error) {
      console.log(`[get-wallet-txs] Errore getWalletTxsUtil per wallet=${wallet.pubkey}:`, error);
      throw error;
    }
    const txs = result.txs || [];
    const total = result.total || 0;
    const failed = result.failed || [];
    console.log(`[get-wallet-txs] wallet=${wallet.pubkey} tx riuscite=${txs.length}/${total} (fallite=${failed.length})`);
    if (txs.length > 0) {
      console.log(`[get-wallet-txs] Salvate ${txs.length} tx in cache/wallet-txs/${wallet.pubkey}/`);
    }
    if (failed.length > 0) {
      console.log('[get-wallet-txs] signature fallite dopo max retry:', failed);
    }
    let remainingFailed = failed;
    let recovered = 0;
    let checkedSignatures: string[] = [];
    try {
      const { doubleCheckWallet } = await import('../utils/doubleCheckWallet.js');
      ({ failed: remainingFailed, recovered, signatures: checkedSignatures } = await doubleCheckWallet(wallet.pubkey, cutoffH, profileId, failed));
    } catch (error) {
      console.warn('[get-wallet-txs] doubleCheckWallet failed', error);
      throw error;
    }
    if (remainingFailed.length > 0) {
      throw new Error(`Incomplete wallet transaction download: ${remainingFailed.length} signatures failed for wallet ${wallet.pubkey}`);
    }
    results.push({ wallet: wallet.pubkey, txCount: txs.length + recovered });
    walletSignatures[wallet.pubkey] = Array.from(new Set([...txs.map(tx => tx.signature), ...checkedSignatures]));
  }
  return { ok: true, profileId, cutoffH, results, walletSignatures };
}
