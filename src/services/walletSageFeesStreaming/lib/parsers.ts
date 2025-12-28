// Funzioni pure di parsing per walletSageFeesStreaming (stub)


// import { sageCraftingDecoder } from '../../../decoders/sage-crafting-decoder.js';

/**
 * Decodifica una transazione usando la logica ufficiale (star-atlas-decoders-main)
 * con fallback legacy su logMessages se necessario.
 */
export function parseTransaction(raw: any): any {
  // Decodifica ufficiale: prova a decodificare ogni istruzione
  let decodedInstruction = undefined;
  if (raw.instructions && Array.isArray(raw.instructions)) {
    for (const instr of raw.instructions) {
      // decodedInstruction = sageCraftingDecoder.decode(instr);
      if (decodedInstruction) break;
    }
  }
  // Fallback: pattern matching su logMessages se la decodifica ufficiale fallisce
  if (!decodedInstruction && raw.logMessages && Array.isArray(raw.logMessages)) {
    // decodedInstruction = sageCraftingDecoder.decode(raw.logMessages);
  }

  // Arricchisci la struttura della transazione
  return {
    ...raw,
    decoded: decodedInstruction || null,
    operation: (decodedInstruction as any)?.name || (decodedInstruction as any)?.type || 'Unknown',
    program: (decodedInstruction as any)?.program || (raw.programIds && raw.programIds[0]) || 'Unknown',
    fee: raw.fee || 0,
    signature: raw.signature || null,
    timestamp: raw.blockTime || null,
  };
}
