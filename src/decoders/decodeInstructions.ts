// Decodifica istruzioni SAGE/Carbon/Crafting (placeholder)
// Input: array di transazioni raw
// Output: array di oggetti decodificati

export type DecodedInstruction = {
  index: number;
  programId: string;
  instructionName?: string;
  decoded?: any;
  error?: string;
  success?: boolean;
  signature?: string;
  txInfo?: {
    blockTime?: number;
    fee?: number;
    status?: any;
    slot?: number;
    meta?: any;
    staticAccountKeys?: any[];
    instructions?: any[];
    addressTableLookups?: any[];
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: any[];
    postTokenBalances?: any[];
    logMessages?: string[];
    innerInstructions?: any[];
  };
};

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function decodeInstructions(transactions: any[]): DecodedInstruction[] {
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const hasRaw = transactions.length > 0 && transactions[0].raw;
  const txsRaw = hasRaw ? transactions.map((t: any) => t.raw) : transactions;
  const sageTxs = txsRaw
    .map((tx, i) => ({ tx, i }))
    .filter(({ tx }) => {
      const keys = tx.transaction?.message?.staticAccountKeys;
      const compiled = tx.transaction?.message?.compiledInstructions;
      if (!Array.isArray(keys) || !Array.isArray(compiled)) return false;
      return compiled.some((ix: any) => typeof ix.programIdIndex === 'number' && keys[ix.programIdIndex] === SAGE_PROGRAM_ID);
    });
  if (sageTxs.length === 0) {
    const result = txsRaw.map((tx, i) => ({
      index: i,
      programId: tx.programIds ? tx.programIds[0] : '',
      instructionName: 'Unknown',
      error: 'Not SAGE',
      success: false
    }));
    console.log(`[decodeInstructions] SAGE ops decodificate: 0, unknown: ${result.length}`);
    return result;
  }
  const binPath = path.join(process.cwd(), 'bin', 'carbon_decoder');
  const binExists = fs.existsSync(binPath);
  let decodedResults: any[] = [];
  // raccolta delle istruzioni SAGE (oggetti {programId,data,txIndex})
  let sageInstructions: Array<{ programId: string, data: string, txIndex: number }> = [];
  if (binExists) {
    // Estrai tutte le istruzioni SAGE da tutte le tx
    // Conserviamo anche il riferimento al tx index così possiamo rimappare i risultati (1 result per istruzione)
    for (const { tx, i: txIdx } of sageTxs) {
      const keys = tx.transaction?.message?.staticAccountKeys;
      const compiled = tx.transaction?.message?.compiledInstructions;
      if (!Array.isArray(keys) || !Array.isArray(compiled)) continue;
      for (const ix of compiled) {
        if (typeof ix.programIdIndex === 'number' && keys[ix.programIdIndex] === SAGE_PROGRAM_ID) {
          let dataHex = '';
          if (ix.data) {
            if (typeof ix.data === 'string') {
              try {
                const bs58 = require('bs58');
                dataHex = Buffer.from(bs58.decode(ix.data)).toString('hex');
              } catch {
                dataHex = Buffer.from(ix.data, 'base64').toString('hex');
              }
            } else if (Array.isArray(ix.data)) {
              dataHex = Buffer.from(ix.data).toString('hex');
            } else if (Buffer.isBuffer(ix.data)) {
              dataHex = ix.data.toString('hex');
            } else if (typeof ix.data === 'object' && ix.data.type === 'Buffer' && Array.isArray(ix.data.data)) {
              dataHex = Buffer.from(ix.data.data).toString('hex');
            }
          }
          sageInstructions.push({ programId: SAGE_PROGRAM_ID, data: dataHex, txIndex: txIdx });
        }
      }
    }
    try {
      const logDir = path.join(process.cwd(), 'log');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      // Batch the requests to the native decoder to avoid E2BIG and to mirror the working script
      const batchSize = 200;
      const allDecoded: any[] = [];
      for (let b = 0; b < sageInstructions.length; b += batchSize) {
        const batch = sageInstructions.slice(b, b + batchSize);
        const payload = JSON.stringify(batch);
        const ts = Date.now();

        const useStdin = payload.length > 100000;
        const spawnArgs = useStdin ? ['--mode', 'composite'] : [payload, '--mode', 'composite'];
        const spawnOpts: any = { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 };
        if (useStdin) spawnOpts.input = payload;
        const res = spawnSync(binPath, spawnArgs, spawnOpts);

        const debugInfo = {
          batchIndex: b / batchSize,
          inputCount: batch.length,
          status: res.status,
          error: res.error ? String(res.error) : null,
          stdoutSize: res.stdout ? res.stdout.length : 0,
          stderrSize: res.stderr ? res.stderr.length : 0,
          stdout: res.stdout ? res.stdout.substring(0, 200000) : null,
          stderr: res.stderr ? res.stderr.substring(0, 200000) : null
        };
        // debug writes removed

        if (!res.error && res.status === 0 && res.stdout) {
          try {
            const parsed = JSON.parse(res.stdout.trim());
            if (Array.isArray(parsed)) allDecoded.push(...parsed);
          } catch (e) {
            // ignore parse errors for this batch
          }
        }
      }
      decodedResults = allDecoded;
    } catch (e) {
      decodedResults = [];
    }
  }
  const results = txsRaw.map((tx, i) => {
    // Cerca la signature: preferisci tx.signature, poi tx.signatures[0], poi tx.raw.signature, tx.raw.signatures[0]
    let signature = tx.signature;
    if (!signature && Array.isArray(tx.signatures) && tx.signatures.length > 0) signature = tx.signatures[0];
    if (!signature && tx.raw && tx.raw.signature) signature = tx.raw.signature;
    if (!signature && tx.raw && Array.isArray(tx.raw.signatures) && tx.raw.signatures.length > 0) signature = tx.raw.signatures[0];
    // Estrai info chiave dalla tx raw
    const txInfo = {
      blockTime: tx.blockTime,
      fee: tx.meta?.fee,
      status: tx.meta?.err === null ? 'Ok' : tx.meta?.err,
      slot: tx.slot,
      meta: tx.meta,
      staticAccountKeys: tx.transaction?.message?.staticAccountKeys,
      instructions: tx.transaction?.message?.compiledInstructions,
      addressTableLookups: tx.transaction?.message?.addressTableLookups,
      preBalances: tx.meta?.preBalances,
      postBalances: tx.meta?.postBalances,
      preTokenBalances: tx.meta?.preTokenBalances,
      postTokenBalances: tx.meta?.postTokenBalances,
      logMessages: tx.meta?.logMessages,
      innerInstructions: tx.meta?.innerInstructions
    };
    // Raccogliamo tutti i risultati del decoder appartenenti a questa tx (il decoder restituisce un elemento per istruzione)
    const decodedForTx = [];
    if (decodedResults && Array.isArray(decodedResults) && sageInstructions.length > 0) {
      for (let k = 0; k < decodedResults.length; k++) {
        const dr = decodedResults[k];
        const si = sageInstructions[k];
        if (si && si.txIndex === i) decodedForTx.push(dr);
      }
    }
    if (decodedForTx.length > 0) {
      // Se almeno un'istruzione è stata decodificata con successo, aggreghiamo i risultati
      const successes = decodedForTx.filter(d => d && d.success === true);
      if (successes.length > 0) {
        return {
          index: i,
          programId: SAGE_PROGRAM_ID,
          instructionName: 'SAGE_OP',
          decoded: decodedForTx,
          success: true,
          error: null,
          signature,
          txInfo
        };
      }
      return {
        index: i,
        programId: SAGE_PROGRAM_ID,
        instructionName: 'SAGE_OP',
        error: 'Decode failed',
        success: false,
        decoded: decodedForTx,
        signature,
        txInfo
      };
    }
    return {
      index: i,
      programId: tx.programIds ? tx.programIds[0] : '',
      instructionName: 'Unknown',
      error: 'Not SAGE',
      success: false,
      signature,
      txInfo
    };
  });
  const sageCount = results.filter(r => r.programId === SAGE_PROGRAM_ID && r.success).length;
  const unknownCount = results.filter(r => r.instructionName === 'Unknown').length;
  console.log(`[decodeInstructions] Decodifica SAGE: totali=${results.length}, sageOps=${sageCount}, unknown=${unknownCount}`);
  return results;
}
