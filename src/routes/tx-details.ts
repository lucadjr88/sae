import { Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { pickNextRpcConnection, tryAcquireRpc, releaseRpc, markRpcFailure, markRpcSuccess } from '../utils/rpc-pool.js';
import { RPC_ENDPOINT } from '../config/serverConfig.js';

export async function txDetailsHandler(req: Request, res: Response) {
  const txid = req.params.txid;
  try {
    // --- INIZIO BLOCCO ESTRATTO ---
    let tx: any = null;
    let rpcIndex = -1;
    let attempts = 0;
    const maxAttempts = 5;
    let pick: { connection: Connection | null; index: number; url?: string } | null = null;
    while (!tx && attempts < maxAttempts) {
      attempts++;
      pick = pickNextRpcConnection();
      if (!pick || !pick.connection || pick.index < 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      rpcIndex = pick.index;
      if (!tryAcquireRpc(rpcIndex)) {
        continue;
      }
      const rpcStartTime = Date.now();
      try {
        const txPromise = pick.connection.getParsedTransaction(txid, { 
          commitment: 'confirmed', 
          maxSupportedTransactionVersion: 0 
        });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
        tx = await Promise.race([txPromise, timeoutPromise]);
        const latency = Date.now() - rpcStartTime;
        if (tx === null) {
          releaseRpc(rpcIndex, { success: false, errorType: 'timeout', latencyMs: latency });
          markRpcFailure(rpcIndex, new Error('timeout'));
          continue;
        }
        releaseRpc(rpcIndex, { success: true, latencyMs: latency });
        markRpcSuccess(rpcIndex);
        break;
      } catch (err: any) {
        const latency = Date.now() - rpcStartTime;
        const errorType = err?.message?.includes('429') ? '429' : 
                         err?.message?.includes('402') ? '402' :
                         err?.message?.includes('timeout') ? 'timeout' : 'other';
        releaseRpc(rpcIndex, { success: false, errorType, latencyMs: latency });
        markRpcFailure(rpcIndex, err);
        if (errorType === '429') {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    if (!tx) {
      try {
        const defaultConn = new Connection(RPC_ENDPOINT);
        const txPromise = defaultConn.getParsedTransaction(txid, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000));
        tx = await Promise.race([txPromise, timeoutPromise]);
      } catch {}
      if (!tx) {
        return res.status(404).json({ error: 'Transaction not found or all RPCs unavailable' });
      }
    }
    // ...existing code...
    // Tutto il resto del blocco originale viene qui copiato senza modifiche
    // --- FINE BLOCCO ESTRATTO ---
  } catch (err: any) {
    console.error('[api/tx-details] Error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch transaction details' });
  }
}
