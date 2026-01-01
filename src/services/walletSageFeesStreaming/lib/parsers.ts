

/**
 * Parser che estrae il nome raw dell'istruzione principale dalla transazione Solana.
 * Nessuna normalizzazione, nessun mapping statico: solo nome istruzione effettivo.
 */
export function parseTransaction(raw: any): any {
  let rawInstruction = 'Unknown';
  let rawInstructionsArr: string[] = [];
  try {
    // Prova a estrarre tutti i nomi raw dalle instructions della transazione
    if (raw?.transaction?.message?.instructions?.length) {
      for (const ix of raw.transaction.message.instructions) {
        let name = 'Unknown';
        if (ix?.parsed?.type) {
          name = ix.parsed.type;
        } else if (ix?.parsed?.instructionType) {
          name = ix.parsed.instructionType;
        } else if (ix?.parsed?.name) {
          name = ix.parsed.name;
        } else if (ix?.programId) {
          name = String(ix.programId);
        }
        rawInstructionsArr.push(name);
      }
      rawInstruction = rawInstructionsArr[0] || 'Unknown';
    } else if (raw?.logMessages && Array.isArray(raw.logMessages)) {
      // fallback: estrai dal log solo se non ci sono instructions
      const match = raw.logMessages.find((l: string) => l.startsWith('Program log: Instruction: '));
      if (match) {
        rawInstruction = match.replace('Program log: Instruction: ', '');
        rawInstructionsArr = [rawInstruction];
      }
    }
  } catch {}
  return {
    ...raw,
    operation: rawInstruction,
    instructions: rawInstructionsArr,
    fee: raw.fee || 0,
    signature: raw.signature || null,
    timestamp: raw.blockTime || null,
  };
}
