// Modulo per crafting detection avanzata con multi-level fallback
// Estrae la logica complessa di riconoscimento crafting dalla funzione monolitica

import { TransactionInfo } from '../types.js';
import {
  CraftingDetectorInput,
  CraftingDetectorOutput
} from './interfaces.js';

/**
 * Crafting detection avanzata con multi-level fallback
 * Estrae la logica complessa di riconoscimento materiali e azioni crafting
 */
export function detectCrafting(input: CraftingDetectorInput): CraftingDetectorOutput {
  const { transaction: tx, operation, isCrafting, sageProgramId, materials } = input;

  let craftingMaterial: string | undefined;
  let craftingAction: string | undefined = 'crafting_start'; // default
  let decodedRecipe: any;
  let enhancedOperation = operation;

  // === EARLY RETURN SE NON È CRAFTING ===
  if (!isCrafting) {
    return {
      craftingMaterial,
      craftingAction,
      decodedRecipe,
      enhancedOperation
    };
  }

  // === 1. INNER INSTRUCTIONS PARSING PER MATERIALI ===
  if (tx.meta && Array.isArray((tx.meta as any).innerInstructions)) {
    for (const blk of (tx.meta as any).innerInstructions) {
      if (!blk || !Array.isArray(blk.instructions)) continue;

      for (const iin of blk.instructions) {
        // Estrai materiale da parsed, program, e dati
        const candidates = [
          iin?.parsed?.destination,
          iin?.parsed?.mint,
          iin?.parsed?.token,
          iin?.parsed?.authority,
          iin?.parsed?.source,
          iin?.program,
          iin?.data
        ];

        for (const val of candidates) {
          if (typeof val === 'string') {
            // Pattern matching per materiali noti
            if (/fuel/i.test(val)) craftingMaterial = 'Fuel';
            else if (/ore/i.test(val)) craftingMaterial = 'Ore';
            else if (/tool/i.test(val)) craftingMaterial = 'Tool';
            else if (/component/i.test(val)) craftingMaterial = 'Component';
            else if (/food/i.test(val)) craftingMaterial = 'Food';
            else if (/ammo/i.test(val)) craftingMaterial = 'Ammo';
            else if (/metal/i.test(val)) craftingMaterial = 'Metal';
            else if (/fiber/i.test(val)) craftingMaterial = 'Fiber';
            else if (/chemical/i.test(val)) craftingMaterial = 'Chemical';
            else if (/circuit/i.test(val)) craftingMaterial = 'Circuit';

            if (craftingMaterial) break;
          }
        }
        if (craftingMaterial) break;
      }
      if (craftingMaterial) break;
    }
  }

  // === 2. FALLBACK: DEDUCI FUEL/FOOD DAI LOG/INSTRUCTIONS ===
  if (!craftingMaterial) {
    const logsLower = (tx.logMessages || []).join(' ').toLowerCase();
    const instrLower = (tx.instructions || []).join(' ').toLowerCase();
    const combinedLower = `${logsLower} ${instrLower}`;

    if (combinedLower.includes('fuel')) craftingMaterial = 'Fuel';
    else if (combinedLower.includes('food')) craftingMaterial = 'Food';
  }

  // === 3. DELTA ANALYSIS PER CRAFTING START/COMPLETE ===
  if (tx.accountKeys && Array.isArray(tx.accountKeys)) {
    // Analizza token balance deltas
    try {
      const preBalances = tx.meta?.preTokenBalances || [];
      const postBalances = tx.meta?.postTokenBalances || [];

      const preMap: Record<string, any> = {};
      for (const p of preBalances) {
        if (!p) continue;
        const key = `${p.owner || ''}:${p.mint || ''}`;
        preMap[key] = p;
      }

      let foundPositive = false;
      let foundNegative = false;

      for (const p of postBalances) {
        if (!p || !p.mint) continue;
        const key = `${p.owner || ''}:${p.mint}`;
        const pre = preMap[key];
        const preAmt = pre?.uiTokenAmount?.amount ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmt = p.uiTokenAmount?.amount ? BigInt(p.uiTokenAmount.amount) : 0n;
        const delta = postAmt - preAmt;

        if (delta > 0n) foundPositive = true;
        if (delta < 0n) foundNegative = true;
      }

      // Logica decisionale basata sui delta
      if (foundPositive && !foundNegative) craftingAction = 'crafting_claim';
      else if (foundNegative && !foundPositive) craftingAction = 'crafting_start';
      else if (foundPositive) craftingAction = 'crafting_claim';

    } catch (e) {
      // Continua con fallback se delta analysis fallisce
    }

    // === 4. FALLBACK A LOGS SE DELTAS INCONCLUSIVE ===
    if (craftingAction === 'crafting_start') {
      const logsStr = (tx.meta?.logMessages || []).join(' ').toLowerCase();
      if (logsStr.includes('claim') || logsStr.includes('complete') || logsStr.includes('withdraw')) {
        craftingAction = 'crafting_claim';
      }
    }

    // === 5. FALLBACK A INNER INSTRUCTIONS TOKEN TRANSFERS ===
    if (craftingAction === 'crafting_start') {
      try {
        const inners = tx.meta?.innerInstructions || [];
        let positiveFound = false;

        for (const inner of inners || []) {
          for (const inst of inner.instructions || []) {
            const parsed = (inst as any).parsed?.info || (inst as any).info || (inst as any).parsed;
            if (!parsed) continue;

            const amount = parsed.amount || parsed.tokenAmount?.amount || parsed.uiTokenAmount?.amount;
            const mint = parsed.mint || parsed.mintAddress || parsed.tokenMint;

            if (!amount || !mint) continue;

            const a = BigInt(String(amount));
            if (a > 0n && materials[mint]) {
              positiveFound = true;
              break;
            }
          }
          if (positiveFound) break;
        }

        if (positiveFound) craftingAction = 'crafting_claim';
      } catch (e) {
        // Ignora errori nel fallback
      }
    }
  }

  return {
    craftingMaterial,
    craftingAction,
    decodedRecipe,
    enhancedOperation
  };
}