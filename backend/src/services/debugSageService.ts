// Service layer per endpoint debug SAGE
// Ogni funzione: input validati, output coerente con docs, gestione edge case, logging

import { nlog } from '../utils/log-normalizer.js';
import { PublicKey } from '@solana/web3.js';
import { decodeCompositeInstructions } from '../decoders/composite-decoder.js';
import { TransactionInfo } from '../examples/types.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { globalPoolConnection, defaultServerConnection } from '../index.js';
// import OP_MAP from '../examples/op-map.js'; // duplicato rimosso

type GetSageTransactionsParams = {
  walletPubkey: string;
  fleetAccount?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
};

type SummarizeInstructionsParams = {
  walletPubkey: string;
  fleetAccount?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
};

type MapTxInstructionsParams = {
  signatures: string[];
  mappingVersion?: string;
};

type GetFleetOpsRawParams = {
  fleetAccount: string;
  fromTimestamp?: number;
  toTimestamp?: number;
};

type GetOpMapTableParams = {
  category?: string;
  instruction?: string;
};

type SearchTransactionsParams = {
  walletPubkey: string;
  searchString: string;
  fromTimestamp?: number;
  toTimestamp?: number;
};

/**
 * getSageTransactions
 * Input: walletPubkey (required), fleetAccount (optional), fromTimestamp, toTimestamp, limit
 * Output: array di TransactionInfo (solo campi richiesti dallo schema output)
 */
export async function getSageTransactions({ walletPubkey, fleetAccount, fromTimestamp, toTimestamp, limit = 100 }: GetSageTransactionsParams): Promise<any[]> {
  // Usa sempre la pool globale, logga errore se non disponibile
  const connection = globalPoolConnection;
  if (!connection) {
    nlog('[debugSageService] ERRORE: globalPoolConnection non disponibile');
    throw new Error('No healthy RPC pool available');
  }
  const pubkey = new PublicKey(walletPubkey);
  // Fetch signatures
  let sigs;
  try {
    sigs = await connection.getSignaturesForAddress(pubkey, { limit });
    nlog(`[debugSageService] getSageTransactions: trovate ${sigs.length} signature per wallet ${walletPubkey} (limit ${limit})`);
  } catch (err: any) {
    nlog(`[debugSageService] ERRORE pool getSignaturesForAddress: ${err?.message || err}`);
    throw new Error('RPC pool error: ' + (err?.message || err));
  }
  // Filtro temporale
  const filteredSigs = sigs.filter(sig => {
    if (fromTimestamp && sig.blockTime && sig.blockTime < fromTimestamp) return false;
    if (toTimestamp && sig.blockTime && sig.blockTime > toTimestamp) return false;
    return true;
  });
  nlog(`[debugSageService] getSageTransactions: dopo filtro temporale rimangono ${filteredSigs.length} signature`);
  // Fetch parsed transactions
  const txs = await Promise.all(filteredSigs.map(async sig => {
    let tx;
    try {
      tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    } catch (err: any) {
      nlog(`[debugSageService] ERRORE pool getParsedTransaction: ${err?.message || err} (sig: ${sig.signature})`);
      return null;
    }
    if (!tx) {
      nlog(`[debugSageService] getSageTransactions: transazione null per signature ${sig.signature}`);
      return null;
    }
    // Estrarre istruzioni SAGE e log
    const instructions = (tx.transaction.message.instructions || []).map(ix => {
      const program = (ix as any).programId?.toBase58?.() || (ix as any).programId || '';
      const name = (ix as any).parsed?.type || (ix as any).parsed?.instructionType || (ix as any).instructionType || '';
      return { program, name, raw: ix };
    });
    // Filtro per fleetAccount (se richiesto): almeno una chiave deve matchare
    if (fleetAccount) {
      const allKeys = tx.transaction.message.accountKeys.map(k => (k as any).pubkey?.toBase58?.() || (k as any).toBase58?.() || String(k));
      if (!allKeys.includes(fleetAccount)) {
        nlog(`[debugSageService] getSageTransactions: transazione ${sig.signature} esclusa per fleetAccount non matchato`);
        return null;
      }
    }
    return {
      signature: sig.signature,
      blockTime: sig.blockTime || 0,
      instructions,
      logMessages: tx.meta?.logMessages || [],
      accountKeys: tx.transaction.message.accountKeys.map(k => (k as any).pubkey?.toBase58?.() || (k as any).toBase58?.() || String(k)),
    };
  }));
  const txsFiltered = txs.filter((tx): tx is NonNullable<typeof tx> => Boolean(tx));
  nlog(`[debugSageService] getSageTransactions: restituisco ${txsFiltered.length} transazioni dopo filtri e parsing`);
  return txsFiltered;
}

/**
 * summarizeInstructions
 * Input: walletPubkey (required), fleetAccount (optional), fromTimestamp, toTimestamp
 * Output: summary: { [instructionType]: { count, signatures[] } }
 */
export async function summarizeInstructions({ walletPubkey, fleetAccount, fromTimestamp, toTimestamp }: SummarizeInstructionsParams): Promise<Record<string, { count: number, signatures: string[] }>> {
  const txs = await getSageTransactions({ walletPubkey, fleetAccount, fromTimestamp, toTimestamp, limit: 1000 });
  const summary: Record<string, { count: number, signatures: string[] }> = {};
  for (const tx of txs) {
    if (!tx) continue;
    for (const ix of tx.instructions || []) {
      if (!ix.name) continue;
      if (!summary[ix.name]) summary[ix.name] = { count: 0, signatures: [] };
      summary[ix.name].count++;
      summary[ix.name].signatures.push(tx.signature);
    }
  }
  return summary;
}

import OP_MAP from '../examples/op-map.js';

/**
 * mapTxInstructions
 * Input: signatures (array), mappingVersion (ignored for ora)
 * Output: [{ signature, instructions, mappingSteps: [{ instr, mapped, category, error }] }]
 */
export async function mapTxInstructions({ signatures, mappingVersion }: MapTxInstructionsParams): Promise<any[]> {
  const connection = globalPoolConnection;
  if (!connection) {
    nlog('[debugSageService] ERRORE: globalPoolConnection non disponibile');
    throw new Error('No healthy RPC pool available');
  }
  const results = [];
  for (const signature of signatures) {
    let tx;
    try {
      tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
    } catch (err: any) {
      nlog(`[debugSageService] ERRORE pool getParsedTransaction: ${err?.message || err} (sig: ${signature})`);
      results.push({ signature, error: 'RPC pool error: ' + (err?.message || err), instructions: [], mappingSteps: [] });
      continue;
    }
    if (!tx) {
      results.push({ signature, error: 'Transaction not found', instructions: [], mappingSteps: [] });
      continue;
    }
    const instructions = (tx.transaction.message.instructions || []).map(ix => {
      const name = (ix as any).parsed?.type || (ix as any).parsed?.instructionType || (ix as any).instructionType || '';
      return name;
    });
    const mappingSteps = instructions.map(instr => {
      if (!instr) return { instr, mapped: null, category: null, error: 'No instruction name' };
      const mapped = OP_MAP[instr] || null;
      return {
        instr,
        mapped,
        category: mapped,
        error: mapped ? null : 'Not mapped'
      };
    });
    results.push({ signature, instructions, mappingSteps });
  }
  return results;
}

/**
 * getFleetOpsRaw
 * Input: fleetAccount (required), fromTimestamp, toTimestamp
 * Output: array di operazioni raw (signature, instruction, mapped, fee, blockTime, raw)
 */
export async function getFleetOpsRaw({ fleetAccount, fromTimestamp, toTimestamp }: GetFleetOpsRawParams): Promise<any[]> {
  let txs;
  try {
    txs = await getSageTransactions({ walletPubkey: fleetAccount, fleetAccount, fromTimestamp, toTimestamp, limit: 1000 });
  } catch (err: any) {
    nlog(`[debugSageService] ERRORE pool getFleetOpsRaw: ${err?.message || err}`);
    throw new Error('RPC pool error: ' + (err?.message || err));
  }
  const ops = [];
  for (const tx of txs) {
    if (!tx) continue;
    for (const ix of tx.instructions || []) {
      const mapped = OP_MAP[ix.name] || null;
      ops.push({
        signature: tx.signature,
        instruction: ix.name,
        mapped,
        fee: 0, // TODO: estrarre fee reale se disponibile
        blockTime: tx.blockTime,
        raw: ix
      });
    }
  }
  return ops;
}

/**
 * getOpMapTable
 * Input: category, instruction (query)
 * Output: array mapping { instruction, mapped, category }
 */
export async function getOpMapTable({ category, instruction }: GetOpMapTableParams): Promise<any[]> {
  const mapping = Object.entries(OP_MAP).map(([instr, mapped]) => ({
    instruction: instr,
    mapped,
    category: mapped // In questo schema mapped == category, ma può essere raffinato
  }));
  let filtered = mapping;
  if (category) filtered = filtered.filter(m => m.category === category);
  if (instruction) filtered = filtered.filter(m => m.instruction === instruction);
  return filtered;
}

/**
 * searchTransactions
 * Input: walletPubkey (required), searchString (required), fromTimestamp, toTimestamp
 * Output: array di TransactionInfo che matchano il pattern
 */
export async function searchTransactions({ walletPubkey, searchString, fromTimestamp, toTimestamp }: SearchTransactionsParams): Promise<any[]> {
  let txs;
  try {
    txs = await getSageTransactions({ walletPubkey, fromTimestamp, toTimestamp, limit: 1000 });
  } catch (err: any) {
    nlog(`[debugSageService] ERRORE pool searchTransactions: ${err?.message || err}`);
    throw new Error('RPC pool error: ' + (err?.message || err));
  }
  const pattern = new RegExp(searchString, 'i');
  return txs.filter(tx => {
    if (!tx) return false;
    if ((tx.instructions || []).some((ix: any) => pattern.test(ix.name))) return true;
    if (tx.logMessages && tx.logMessages.some((msg: string) => pattern.test(msg))) return true;
    if (tx.accountKeys && tx.accountKeys.some((k: string) => pattern.test(k))) return true;
    return false;
  });
}
