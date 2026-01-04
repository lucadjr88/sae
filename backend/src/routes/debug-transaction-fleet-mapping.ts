import { Request, Response } from 'express';
import { Connection, PublicKey, PartiallyDecodedInstruction } from '@solana/web3.js';
import { RPC_ENDPOINT } from '../config/serverConfig.js';
import { globalPoolConnection } from '../index.js';

/**
 * Debug API: Analizza associazione transazione-flotta
 */
export async function debugTransactionFleetMappingHandler(req: Request, res: Response) {
  const { signature, fleetAccounts } = req.body;
  if (!signature) {
    return res.status(400).json({ error: 'signature required' });
  }
  if (!fleetAccounts || !Array.isArray(fleetAccounts)) {
    return res.status(400).json({ error: 'fleetAccounts array required' });
  }

  try {
    const connection = globalPoolConnection || new Connection(RPC_ENDPOINT);

    // Ottieni transazione
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const accountKeys = tx.transaction.message.accountKeys.map(k => (k as any).pubkey?.toBase58() || (k as any).toBase58?.() || String(k));
    const fleetAccountsSet = new Set(fleetAccounts);

    // Trova intersezione
    const matchingAccounts = accountKeys.filter(acc => fleetAccountsSet.has(acc));

    // Determina associazione
    let associatedFleet: string | null = null;
    let associationReason = 'No matching fleet accounts found';

    if (matchingAccounts.length > 0) {
      associatedFleet = matchingAccounts[0]; // Prendi il primo match
      const index = accountKeys.indexOf(associatedFleet);
      associationReason = `Account ${associatedFleet} found at position ${index} in transaction accountKeys`;
    }

    // Prova a parsare l'operazione (semplificato)
    let operation = 'Unknown';
    let fee = 0;
    if (tx.meta?.fee) {
      fee = tx.meta.fee;
    }

    // Se è SAGE, prova a identificare operazione
    const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if (ix.programId.toString() === SAGE_PROGRAM_ID) {
        // Qui potremmo usare i decoder, ma per semplicità restituiamo raw
        if ('data' in ix && ix.data) {
          operation = `SAGE instruction: ${ix.data.slice(0, 8)}...`;
        } else {
          operation = `SAGE instruction (parsed)`;
        }
        break;
      }
    }

    res.json({
      signature,
      associatedFleet,
      associationReason,
      matchingAccounts,
      operation,
      fee,
      accountKeys,
      slot: tx.slot,
      blockTime: tx.blockTime,
      success: tx.meta?.err === null
    });
  } catch (err: any) {
    console.error('❌ /api/debug/transaction-fleet-mapping error:', err.message);
    res.status(500).json({ error: err.message });
  }
}