// Modulo per parsing istruzioni SAGE con fallback multipli
// Estrae la logica di riconoscimento operazioni dalla funzione monolitica

import { TransactionInfo } from '../types.js';
import {
  SageInstructionParserInput,
  SageInstructionParserOutput
} from './interfaces.js';

/**
 * Parsing istruzioni SAGE con fallback multipli
 * Estrae la logica di riconoscimento operazioni dalla funzione monolitica
 */
export function parseSageInstructions(input: SageInstructionParserInput): SageInstructionParserOutput {
  const { transaction: tx } = input;

  let operation = 'Unknown';
  let isCrafting = false;
  let hasSageInstruction = false;
  let craftingType: string | undefined;

  // === 1. PARSING ISTRUZIONI DIRETTE (RAW) ===
  if (tx.instructions && tx.instructions.length > 0) {
    for (const instr of tx.instructions) {
      if (typeof instr === 'string' && instr !== 'Unknown') {
        operation = instr;
        hasSageInstruction = true;
        if (/craft/i.test(instr)) {
          isCrafting = true;
          craftingType = instr;
        }
        break;
      }
    }
  }

  // === 2. FALLBACK SU LOGMESSAGES ===
  if (operation === 'Unknown' && tx.logMessages) {
    for (const log of tx.logMessages) {
      const ixMatch = log.match(/Instruction:\s*(\w+)/);
      if (ixMatch) {
        operation = ixMatch[1];
        hasSageInstruction = true;
        if (/craft/i.test(operation)) {
          isCrafting = true;
          craftingType = operation;
        }
        break;
      }
    }
  }

  return {
    operation,
    isCrafting,
    hasSageInstruction,
    craftingType
  };
}