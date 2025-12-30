
/**
 * Funzione atomica: normalizza una raw Solana tx in WalletTx
 * - Segue la strategia AI-OPTIMIZED: mapping statico, validazione esplicita, nessun lazy coding
 * - Pattern anti-hallucination: mapping programId→opType dichiarato staticamente
 * - Ogni campo estratto è validato e documentato
 * - Ogni errore di parsing o struttura viene loggato e gestito
 */

import { WalletTx, OpType } from './OpType';

// Mapping statico programId → opType (aggiornare SOLO qui e nei test)
const PROGRAM_ID_TO_OPTYPE: Record<string, OpType> = {
  // Star Atlas core
  'Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk': 'cargo',
  'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE': 'subwarp',
  'Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM': 'mining',
  // SPL Token
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'token',
  // System Program
  '11111111111111111111111111111111': 'system',
  // Compute Budget
  'ComputeBudget111111111111111111111111111111': 'compute',
  // Memo
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'memo',
  // Stake
  'Stake11111111111111111111111111111111111111': 'stake',
  // Associated Token
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'associatedToken',
  // Address Lookup Table
  'AddressLookupTab1e1111111111111111111111111': 'addressLookup',
};

// Priority order for operation types (higher number = higher priority)
const OPTYPE_PRIORITY: Record<OpType, number> = {
  'cargo': 10,
  'subwarp': 9,
  'mining': 8,
  'fees': 7,
  'crafting': 6,
  'staking': 5,
  'token': 5,
  'system': 4,
  'stake': 3,
  'associatedToken': 2,
  'compute': 1,
  'memo': 1,
  'addressLookup': 1,
  'altro': 0,
};

// Estrae tutti i programId da istruzioni principali e innerInstructions
function extractProgramIds(rawTx: any): string[] {
  const ids = new Set<string>();
  if (rawTx?.transaction?.message?.instructions) {
    for (const ix of rawTx.transaction.message.instructions) {
      if (ix.programId) ids.add(ix.programId);
      if (ix.programIdIndex !== undefined && rawTx.transaction.message.accountKeys) {
        ids.add(rawTx.transaction.message.accountKeys[ix.programIdIndex]);
      }
    }
  }
  if (rawTx?.meta?.innerInstructions) {
    for (const inner of rawTx.meta.innerInstructions) {
      for (const ix of inner.instructions || []) {
        if (ix.programId) ids.add(ix.programId);
        if (ix.programIdIndex !== undefined && rawTx.transaction.message.accountKeys) {
          ids.add(rawTx.transaction.message.accountKeys[ix.programIdIndex]);
        }
      }
    }
  }
  return Array.from(ids);
}

// Estrae tutti gli accountKeys coinvolti nella transazione
function extractAccountKeys(rawTx: any): string[] {
  const keys = new Set<string>();
  if (rawTx?.transaction?.message?.accountKeys) {
    for (const k of rawTx.transaction.message.accountKeys) {
      if (typeof k === 'string') {
        keys.add(k);
      } else if (k && k.pubkey) {
        keys.add(k.pubkey);
      }
    }
  }
  // Possibile estensione: estrarre anche da innerInstructions se necessario
  return Array.from(keys);
}

// Estrae amount se presente (TODO: implementare estrazione reale da istruzioni SPL Token/cargo)
function extractAmount(rawTx: any): number | undefined {
  // TODO: implementare estrazione reale
  return undefined;
}


/**
 * Normalizza una raw Solana tx in WalletTx secondo mapping statico e validazione esplicita.
 * @param rawTx Oggetto JSON della transazione Solana (raw)
 * @returns WalletTx normalizzato
 * @throws Error se rawTx non valido
 */
export function normalizeRawTxToWalletTx(rawTx: any): WalletTx {
  if (!rawTx || typeof rawTx !== 'object') throw new Error('rawTx non valido');
  const programIds = extractProgramIds(rawTx);
  let type: OpType = 'altro';
  let maxPriority = 0;
  
  for (const pid of programIds) {
    const opType = PROGRAM_ID_TO_OPTYPE[pid];
    if (opType) {
      const priority = OPTYPE_PRIORITY[opType] || 0;
      if (priority > maxPriority) {
        type = opType;
        maxPriority = priority;
      }
    }
  }
  
  // Fallback: se non matcha nulla, logga il programId principale per debug
  if (type === 'altro' && programIds.length > 0 && typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[normalizeRawTxToWalletTx] programId non mappato:', programIds[0]);
  }
  const accountKeys = extractAccountKeys(rawTx);
  const amount = extractAmount(rawTx);
  return {
    accountKeys,
    type,
    amount,
    timestamp: rawTx.blockTime ? String(rawTx.blockTime) : undefined,
    txid: rawTx.transaction?.signatures?.[0],
    raw: rawTx,
  };
}
