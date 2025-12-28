// src/decoders/instruction-decoder.ts
// Funzione per decodificare istruzioni dai log

import { SAGE_STARBASED_INSTRUCTIONS, CRAFTING_INSTRUCTIONS, DecodedInstruction } from './instruction-maps.js';

/**
 * Decode a SAGE or Crafting instruction by examining log messages
 * This is a heuristic decoder that looks for instruction names in log messages
 */
export function decodeInstructionFromLogs(logMessages: string[]): DecodedInstruction | undefined {
  for (const log of logMessages) {
    // Look for instruction names in logs
    // Format: "Instruction: InstructionName"
    const ixMatch = log.match(/Instruction:\s*(\w+)/i);
    if (ixMatch) {
      const ixName = ixMatch[1];
      // Check SAGE Starbased
      if (SAGE_STARBASED_INSTRUCTIONS[ixName]) {
        return SAGE_STARBASED_INSTRUCTIONS[ixName];
      }
      // Check Crafting
      if (CRAFTING_INSTRUCTIONS[ixName]) {
        return CRAFTING_INSTRUCTIONS[ixName];
      }
    }

    // Look for specific patterns
    if (/StartCraftingProcess|CreateCraftingProcess/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['CreateCraftingProcess'];
    }
    if (/StopCraftingProcess|CloseCraftingProcess/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['StopCraftingProcess'];
    }
    if (/ClaimCraftingOutputs/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['ClaimCraftingOutputs'];
    }
    if (/StartMiningAsteroid/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['StartMiningAsteroid'];
    }
    if (/StopMiningAsteroid/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['StopMiningAsteroid'];
    }
    // --- MOVEMENT/WARP/SUBWARP ---
    if (/StartSubwarp/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['StartSubwarp'];
    }
    if (/StopSubwarp/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['StopSubwarp'];
    }
    if (/WarpToCoordinate/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['WarpToCoordinate'];
    }
    if (/WarpLane/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['WarpLane'];
    }
    // --- END MOVEMENT ---
    if (/ScanForSurveyDataUnits/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['ScanForSurveyDataUnits'];
    }
    if (/RepairDockedFleet/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['RepairDockedFleet'];
    }
    if (/RepairIdleFleet/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['RepairIdleFleet'];
    }
    if (/AttackFleet/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['AttackFleet'];
    }
    if (/AttackStarbase/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['AttackStarbase'];
    }
    if (/RetrieveLoot/i.test(log)) {
      return SAGE_STARBASED_INSTRUCTIONS['RetrieveLoot'];
    }
  }
  
  return undefined;
}
