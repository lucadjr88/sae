import { TransactionInfo } from '../types.js';
import { CraftingPairerInput, CraftingPairerOutput } from './interfaces.js';

/**
 * CraftingPairer - Modulo per pairing transazioni crafting
 *
 * Responsabilità: Merge di transazioni crafting start/complete entro finestra
 * temporale per fornire visione unificata delle operazioni crafting.
 */
export async function pairCraftingTransactions(input: CraftingPairerInput): Promise<CraftingPairerOutput> {
  const { processedTransactions, timeWindowMs = 30000 } = input; // Default 30 secondi

  // Crea map per pairing crafting
  const craftingPairs = new Map<string, { start: TransactionInfo; complete: TransactionInfo | null }>();

  // Prima passata: identifica start e complete crafting
  for (const tx of processedTransactions) {
    const hasCreate = tx.instructions?.some(instr =>
      instr.includes('CreateCraftingProcess') ||
      instr.includes('CreateRecipe') ||
      instr.includes('StartCrafting')
    );

    const hasClose = tx.instructions?.some(instr =>
      instr.includes('CloseCraftingProcess') ||
      instr.includes('CloseRecipe')
    );

    const hasBurn = tx.instructions?.some(instr =>
      instr.includes('BurnConsumableIngredient') ||
      instr.includes('BurnCraftingConsumables') ||
      instr.includes('BurnIngredient')
    );

    const hasClaim = tx.instructions?.some(instr =>
      instr.includes('ClaimRecipeOutput') ||
      instr.includes('ClaimCraftingOutputs') ||
      instr.includes('ClaimOutputs')
    );

    // Estrai fleet name dalla transazione (se disponibile)
    const fleetName = (tx as any).involvedFleetName ||
                     ((tx as any).involvedFleets && (tx as any).involvedFleets[0]) ||
                     'unknown';

    if (hasCreate) {
      // Transazione di start crafting
      const key = `craft_${tx.blockTime || 0}_${fleetName}`;
      craftingPairs.set(key, { start: tx, complete: null });
    } else if (hasClose && (hasBurn || hasClaim)) {
      // Transazione di complete crafting - cerca matching start
      const completeTime = tx.blockTime || 0;

      // Cerca all'indietro per trovare matching start entro finestra temporale
      for (const [key, pair] of Array.from(craftingPairs.entries()).reverse()) {
        if (!pair.complete && pair.start) {
          const startTime = pair.start.blockTime || 0;
          const timeDelta = Math.abs(completeTime - startTime);

          // Estrai fleet name dalla start transaction
          const startFleetName = (pair.start as any).involvedFleetName ||
                                ((pair.start as any).involvedFleets && (pair.start as any).involvedFleets[0]) ||
                                'unknown';

          // Match se stesso fleet e entro finestra temporale
          if (startFleetName === fleetName && timeDelta <= timeWindowMs) {
            pair.complete = tx;
            break;
          }
        }
      }
    }
  }

  // Seconda passata: merge paired transactions
  const pairedSignatures = new Set<string>();
  const mergedTransactions: TransactionInfo[] = [];

  for (const [key, pair] of craftingPairs.entries()) {
    if (pair.start && pair.complete) {
      // Merge start + complete
      pairedSignatures.add(pair.start.signature);
      pairedSignatures.add(pair.complete.signature);

      mergedTransactions.push({
        ...pair.start,
        signature: `${pair.start.signature}+${pair.complete.signature}`,
        fee: pair.start.fee + pair.complete.fee,
        instructions: [
          ...(pair.start.instructions || []),
          ...(pair.complete.instructions || [])
        ],
        logMessages: [
          ...(pair.start.logMessages || []),
          ...(pair.complete.logMessages || [])
        ],
        pairedTxs: [pair.start.signature, pair.complete.signature],
        isPaired: true,
        blockTime: pair.start.blockTime, // Usa timestamp della start
        // Mantieni altri campi dalla start transaction
        accountKeys: pair.start.accountKeys,
        programIds: pair.start.programIds,
        meta: pair.start.meta
      } as TransactionInfo);
    } else if (pair.start) {
      // Start senza complete - aggiungi come singola
      mergedTransactions.push(pair.start);
    }
  }

  // Aggiungi transazioni non paired
  for (const tx of processedTransactions) {
    if (!pairedSignatures.has(tx.signature)) {
      mergedTransactions.push(tx);
    }
  }

  // Conta transazioni paired
  const pairedCount = Array.from(craftingPairs.values())
    .filter(pair => pair.start && pair.complete)
    .length;

  return {
    mergedTransactions,
    pairedCount
  };
}