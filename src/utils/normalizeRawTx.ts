// Normalizza una transazione raw in un oggetto uniforme
export function normalizeRawTx(rawTx: any) {
  // Estrai tutti i programId reali dalle compiledInstructions usando staticAccountKeys
  let programIds: string[] = [];
  if (
    rawTx.transaction &&
    rawTx.transaction.message &&
    Array.isArray(rawTx.transaction.message.compiledInstructions) &&
    Array.isArray(rawTx.transaction.message.staticAccountKeys)
  ) {
    const keys = rawTx.transaction.message.staticAccountKeys;
    programIds = rawTx.transaction.message.compiledInstructions.map((ix: any) => {
      if (typeof ix.programIdIndex === 'number' && keys[ix.programIdIndex]) {
        return keys[ix.programIdIndex];
      }
      return '';
    }).filter(Boolean);
  }
  return {
    signature: rawTx.signature || '',
    fee: rawTx.fee || (rawTx.meta && rawTx.meta.fee) || 0,
    blockTime: rawTx.blockTime || rawTx.blocktime || (rawTx.meta && rawTx.meta.blockTime) || null,
    programIds,
    operation: rawTx.operation || (rawTx.meta && rawTx.meta.operation) || 'Unknown',
    // ...altri campi utili
  };
}
