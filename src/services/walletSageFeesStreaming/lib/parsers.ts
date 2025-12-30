
import { normalizeRawTxToWalletTx } from '../../../decoders/normalizeRawTxToWalletTx';

/**
 * Decodifica e normalizza una transazione Solana secondo la strategia AI-ottimizzata.
 * Applica il mapping statico programId→opType e restituisce una struttura coerente.
 */
export function parseTransaction(raw: any): any {
  let normalized: any = null;
  try {
    normalized = normalizeRawTxToWalletTx(raw);
  } catch (err) {
    // fallback legacy se la normalizzazione fallisce
    normalized = null;
  }

  if (normalized) {
    return {
      ...raw,
      ...normalized,
      operation: normalized.type || 'Unknown',
      program: (normalized.programId || (Array.isArray(normalized.programIds) && normalized.programIds[0])) || 'Unknown',
      fee: raw.fee || 0,
      signature: raw.signature || null,
      timestamp: raw.blockTime || null,
    };
  }

  // fallback legacy: struttura minima
  return {
    ...raw,
    operation: 'Unknown',
    program: (raw.programIds && raw.programIds[0]) || 'Unknown',
    fee: raw.fee || 0,
    signature: raw.signature || null,
    timestamp: raw.blockTime || null,
  };
}
