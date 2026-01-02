

import { SAGE_INSTRUCTION_MAP } from '../../../decoders/sage-instruction-map.js';

const SAGE_SPECIFIC_INSTRUCTIONS = new Set(SAGE_INSTRUCTION_MAP.map(i => i.name));
SAGE_SPECIFIC_INSTRUCTIONS.delete('FleetStateHandler');

/**
 * Parser che estrae il nome raw dell'istruzione principale dalla transazione Solana.
 * Nessuna normalizzazione, nessun mapping statico: solo nome istruzione effettivo.
 */
export function parseTransaction(raw: any): any {
  let rawInstruction = 'Unknown';
  let rawInstructionsArr: string[] = Array.isArray(raw.instructions) ? [...raw.instructions] : [];
  
  try {
    // 1. Se non abbiamo istruzioni, proviamo a estrarle dai log (fallback simile a getAccountTransactions)
    if (rawInstructionsArr.length === 0 && raw?.logMessages && Array.isArray(raw.logMessages)) {
      for (const log of raw.logMessages) {
        const ixMatch = log.match(/Instruction: (\w+)/);
        if (ixMatch) rawInstructionsArr.push(ixMatch[1]);
        
        if (log.includes('SAGE') || log.includes('sage')) {
          const sageIxMatch = log.match(/ix([A-Z][a-zA-Z]+)/);
          if (sageIxMatch) rawInstructionsArr.push(sageIxMatch[1]);
        }
      }
      // Rimuovi duplicati
      rawInstructionsArr = [...new Set(rawInstructionsArr)];
    }

    // 2. Se abbiamo ancora zero istruzioni, proviamo da raw.transaction (se presente)
    if (rawInstructionsArr.length === 0 && raw?.transaction?.message?.instructions?.length) {
      for (const ix of raw.transaction.message.instructions) {
        let name = 'Unknown';
        if (ix?.parsed?.type) name = ix.parsed.type;
        else if (ix?.parsed?.instructionType) name = ix.parsed.instructionType;
        else if (ix?.parsed?.name) name = ix.parsed.name;
        else if (ix?.programId) name = String(ix.programId);
        rawInstructionsArr.push(name);
      }
    }

    // 3. Determina l'operazione principale
    if (raw.compositeDecoded && raw.compositeDecoded.isComposite) {
      const decodedNames = raw.compositeDecoded.instructions
        .filter((ix: any) => ix.success && ix.instructionName)
        .map((ix: any) => ix.instructionName);
      
      if (decodedNames.length > 0) {
        rawInstructionsArr = [...new Set([...rawInstructionsArr, ...decodedNames])];
        // Se abbiamo nomi decodificati, usiamo il primo come operazione principale se quello attuale è generico
        if (rawInstruction === 'Unknown' || rawInstruction === 'FleetStateHandler') {
          rawInstruction = decodedNames[0];
        }
      }
    }

    if (rawInstructionsArr.length > 0) {
      // Priorità alle istruzioni SAGE specifiche
      const specificIx = rawInstructionsArr.find(ix => SAGE_SPECIFIC_INSTRUCTIONS.has(ix));
      if (specificIx) {
        rawInstruction = specificIx;
      } else {
        // Fallback alla prima istruzione non-generic
        for (const instr of rawInstructionsArr) {
          if (instr && instr !== 'Unknown' && !['ComputeBudget', 'Approve', 'Burn', 'Transfer', 'IncrementPoints'].includes(instr)) {
            rawInstruction = instr;
            break;
          }
        }
        if (rawInstruction === 'Unknown') {
          rawInstruction = rawInstructionsArr[0] || 'Unknown';
        }
      }
    }

    // 4. Raffinamento FleetStateHandler
    if (rawInstruction === 'FleetStateHandler' && raw.logMessages) {
      const logsJoined = raw.logMessages.join(' ');
      let refined = rawInstruction;
      const logsLower = logsJoined.toLowerCase();
      
      if (logsLower.includes('movesubwarp') || logsLower.includes('stopsubwarp') || logsLower.includes('subwarp')) {
        refined = 'FleetStateHandler_subwarp';
      } else if (logsLower.includes('mineasteroid') || logsLower.includes('stopmining') || logsLower.includes('mining')) {
        refined = 'FleetStateHandler_mining';
      } else if (logsLower.includes('loadingbaytoidle') || logsLower.includes('idletoloadingbay')) {
        refined = 'FleetStateHandler_loading_bay';
      }
      
      if (refined !== rawInstruction) {
        rawInstruction = refined;
        // Aggiorna anche l'array delle istruzioni per l'aggregatore
        rawInstructionsArr = rawInstructionsArr.map(ix => ix === 'FleetStateHandler' ? refined : ix);
      }
    }
  } catch (err) {
    console.error('[parseTransaction] Error:', err);
  }

  return {
    ...raw,
    operation: rawInstruction,
    instructions: rawInstructionsArr,
    fee: raw.fee || 0,
    signature: raw.signature || null,
    timestamp: raw.blockTime || null,
  };
}
