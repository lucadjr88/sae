
// Fetch account info Solana (buffer) per un profileId
// (Stub: implementare con @solana/web3.js reale)
export async function fetchSolanaAccountInfo(profileId: string): Promise<Buffer | null> {
  let pick: any = null;
  try {
    const { RpcPoolManager } = await import('./rpc/rpc-pool-manager');
    pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
    const { connection, release } = pick;
    const { PublicKey } = await import('@solana/web3.js');
    const pk = new PublicKey(profileId);
    const acc = await connection.getAccountInfo(pk);
    if (!acc) {
      console.log(`[fetchSolanaAccountInfo] Nessun account trovato per ${profileId}`);
      release({ success: true });
      return null;
    }
    console.log(`[fetchSolanaAccountInfo] Account trovato, data length: ${acc.data?.length}`);
    release({ success: true });
    return Buffer.from(acc.data);
  } catch (e) {
    if (pick && pick.release) {
      try { pick.release({ success: false }); } catch {}
    }
    console.error(`[fetchSolanaAccountInfo] Errore:`, e);
    return null;
  }
}
