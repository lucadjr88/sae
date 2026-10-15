
// Fetch account info Solana (buffer) per un profileId
// (Stub: implementare con @solana/web3.js reale)
export async function fetchSolanaAccountInfo(profileId: string): Promise<Buffer | null> {
  const { RpcPoolManager } = await import('./rpc/rpc-pool-manager.js');
  const { PublicKey } = await import('@solana/web3.js');
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
  const urls = new Set(pool.map(endpoint => endpoint?.url).filter((url: unknown): url is string => typeof url === 'string'));
  const excludedUrls = new Set<string>();
  const profileKey = new PublicKey(profileId);
  let foundAccount: Buffer | null = null;

  for (let attempt = 0; attempt < urls.size; attempt += 1) {
    let pick: any = null;
    try {
      pick = await RpcPoolManager.pickRpcConnection(profileId, {
        waitForMs: 2000,
        allowStale: true,
        excludeUrls: excludedUrls,
      });
      const account = await pick.connection.getAccountInfo(profileKey, 'confirmed');
      const rpcName = String(pick.endpoint?.name ?? 'unknown');
      pick.release({ success: true });
      if (account) {
        console.log(`[fetchSolanaAccountInfo] Account trovato, rpc=${rpcName}, data length=${account.data?.length}`);
        foundAccount = Buffer.from(account.data);
        break;
      }
      console.warn(`[fetchSolanaAccountInfo] Account assente su rpc=${rpcName}; provo un endpoint alternativo`);
    } catch (error) {
      const endpointUrl = pick?.endpoint?.url;
      if (typeof endpointUrl === 'string') excludedUrls.add(endpointUrl);
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const errorType = /429|Too Many Requests/i.test(message)
        ? '429'
        : /401|403|Unauthorized|Forbidden|5\d\d|timeout|timed out|fetch failed|ECONNRESET|ENOTFOUND/i.test(message)
          ? '503'
          : 'error';
      if (pick?.release) {
        try { pick.release({ success: false, errorType }); } catch {}
      }
      let rpcHost = 'unknown';
      try { rpcHost = new URL(endpointUrl).host; } catch {}
      console.warn(`[fetchSolanaAccountInfo] Lettura profilo fallita su rpc=${pick?.endpoint?.name ?? 'unknown'} host=${rpcHost}: ${message.replace(/https?:\/\/\S+/g, '<rpc-url>')}`);
    }
  }

  if (!foundAccount) console.error(`[fetchSolanaAccountInfo] Nessun endpoint ha restituito l'account ${profileId}`);
  return foundAccount;
}
