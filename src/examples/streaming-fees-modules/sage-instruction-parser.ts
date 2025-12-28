// Modulo per parsing istruzioni SAGE con fallback multipli
// Estrae la logica di riconoscimento operazioni dalla funzione monolitica

import { TransactionInfo } from '../types.js';
import { decodeSageInstruction } from '../../decoders/sage-crafting-decoder.js';
import {
  SageInstructionParserInput,
  SageInstructionParserOutput
} from './interfaces.js';

/**
 * Parsing istruzioni SAGE con fallback multipli
 * Estrae la logica di riconoscimento operazioni dalla funzione monolitica
 */
export function parseSageInstructions(input: SageInstructionParserInput): SageInstructionParserOutput {
  const { transaction: tx, opMap } = input;

  let operation = 'Unknown';
  let isCrafting = false;
  let hasSageInstruction = false;
  let craftingType: string | undefined;

  // === 1. PARSING ISTRUZIONI DIRETTE ===
  if (tx.instructions && tx.instructions.length > 0) {
    for (const instr of tx.instructions) {
      // Prima prova: decodeSageInstruction
      const decoded = decodeSageInstruction(instr);
      if (decoded && (decoded.program === 'SAGE-Starbased' || decoded.program === 'Crafting') && decoded.craftType === 'crafting') {
        isCrafting = true;
        hasSageInstruction = true;
        craftingType = decoded.name || decoded.craftType || 'Crafting';
        operation = craftingType;
        break;
      }

      // Fallback legacy: OP_MAP diretto
      if (opMap[instr]) {
        operation = opMap[instr];
        hasSageInstruction = true;
        if (operation === 'Crafting') isCrafting = true;
        break;
      }

      // Fallback regex: pattern crafting semplice
      if (/craft/i.test(instr)) {
        operation = 'Crafting';
        isCrafting = true;
        hasSageInstruction = true;
        break;
      }
    }
  }

  // === 2. PATTERN MATCHING SU LOGMESSAGES (FALLBACK PER UNKNOWN) ===
  if (operation === 'Unknown' && tx.logMessages) {
    for (const log of tx.logMessages) {
      const ixMatch = log.match(/Instruction:\s*(\w+)/);
      if (ixMatch) {
        const ixName = ixMatch[1];
        if (opMap[ixName]) {
          operation = opMap[ixName];
          hasSageInstruction = true;
          if (operation.includes('Craft')) isCrafting = true;
          break;
        }
      }
    }
  }

  // === 2B. ADDITIONAL CRAFTING DETECTION ===
  if (!isCrafting && tx.logMessages) {
    for (const log of tx.logMessages) {
      if (/craft/i.test(log)) {
        operation = 'Crafting';
        isCrafting = true;
        hasSageInstruction = true;
        break;
      }
    }
  }

  // === 2C. ENHANCED FLEETSTATEHANDLER DETECTION ===
  if (operation === 'FleetStateHandler' && tx.logMessages) {
    const logsJoined = tx.logMessages.join(' ');
    if (logsJoined.includes('MoveSubwarp')) {
      operation = 'StopSubwarp';
    } else if (logsJoined.includes('MineAsteroid')) {
      operation = 'StopMining';
    }
  }

  return {
    operation,
    isCrafting,
    hasSageInstruction,
    craftingType
  };
}