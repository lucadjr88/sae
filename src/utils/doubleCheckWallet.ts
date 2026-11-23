import type { ConfirmedSignatureInfo } from '@solana/web3.js';
import { withRpcTimeout } from './solanaRpc.js';
import { getCachedWalletTransaction } from './fetchAndCacheWalletTxs.js';

export async function doubleCheckWallet(wallet: string, cutoffH: number, profileId: string, failedSignatures: string[] = []): Promise<{ failed: string[]; recovered: number; signatures: string[] }> {
  const sinceMs = Date.now() - cutoffH * 3600 * 1000;
  let pick: any = null;
  let checked = false;
  let signatures: ConfirmedSignatureInfo[] = [];
  const missing = new Set(failedSignatures);
  const checkedSignatures: string[] = [];
  try {
    pick = await (await import('./rpc/rpc-pool-manager.js')).RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000, disableRetryOnRateLimit: true });
    const { connection, release } = pick;
    const { PublicKey } = await import('@solana/web3.js');
    const address = new PublicKey(wallet);
    signatures = await withRpcTimeout<ConfirmedSignatureInfo[]>(connection.getSignaturesForAddress(address), 10000, 'double-check getSignaturesForAddress');
    release({ success: true });
    pick = null;
    checked = true;
  } catch (err) {
    if (pick && pick.release) {
      try { pick.release({ success: false }); } catch {}
    }
    const rpcName = pick?.endpoint?.name ?? 'unknown';
    const rpcUrl = pick?.endpoint?.url ?? 'n/a';
    console.log(`[double-check] Errore durante doubleCheck per wallet=${wallet} rpc=${rpcName} url=${rpcUrl}:`, err);
  }

  for (const sig of signatures) {
    if (sig.blockTime && sig.blockTime * 1000 >= sinceMs) {
      checkedSignatures.push(sig.signature);
      if (!await getCachedWalletTransaction(wallet, sig.signature, profileId)) missing.add(sig.signature);
    }
  }

  if (missing.size === 0) {
    if (checked) console.log(`[double-check] wallet=${wallet} tutte le signature verificate hanno una tx salvata: OK`);
    return { failed: [], recovered: 0, signatures: checkedSignatures };
  }

  console.log(`[double-check] wallet=${wallet} signature mancanti:`, Array.from(missing));
  const { fetchWalletTransactions } = await import('./solanaRpc.js');
  const { txs: retriedTxs, failed: retriedFailed } = await fetchWalletTransactions(wallet, sinceMs, profileId, Array.from(missing), true);
  if (retriedFailed.length === 0) {
    console.log(`[double-check] wallet=${wallet} tutte le signature mancanti recuperate con successo!`);
  } else {
    console.log(`[double-check] wallet=${wallet} signature mancanti anche dopo retry:`, retriedFailed);
  }
  return { failed: retriedFailed, recovered: retriedTxs.length, signatures: [...checkedSignatures, ...retriedTxs.map(tx => tx.signature)] };
}

export default doubleCheckWallet;
