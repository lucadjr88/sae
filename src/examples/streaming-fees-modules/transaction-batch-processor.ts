import { TransactionInfo } from '../types.js';
import { TransactionBatchProcessorInput, TransactionBatchProcessorOutput } from './interfaces.js';
import { parseSageInstructions } from './sage-instruction-parser.js';
import { detectCrafting } from './crafting-detector.js';
import { decodeRecipeAccounts } from './recipe-decoder.js';
import { associateFleet } from './fleet-associator.js';
import { aggregateFees } from './fee-aggregator.js';

/**
 * TransactionBatchProcessor - Modulo per processamento batch transazioni
 *
 * Responsabilità: Integrazione di tutti i moduli di parsing per processare
 * batch di transazioni, aggiornare stato globale e gestire progress updates.
 */
export async function processTransactionBatch(input: TransactionBatchProcessorInput): Promise<TransactionBatchProcessorOutput> {
  const { batch, context, sendUpdate, saveProgress } = input;
  const batchStart = Date.now();

  let processedCount = 0;
  const feesUpdates: Record<string, any> = {};
  const operationUpdates: Record<string, any> = {};
  const newTransactions: TransactionInfo[] = [];

  // Processa ogni transazione nel batch
  for (const tx of batch) {
    try {
      // Aggiorna totali fee globali
      context.totalFees24h += tx.fee;
      if (tx.programIds && tx.programIds.includes(context.constants.SAGE_PROGRAM_ID)) {
        context.sageFees24h += tx.fee;
      }

      // Salta transazioni non-SAGE (no SAGE program ID)
      if (!tx.programIds || !tx.programIds.includes(context.constants.SAGE_PROGRAM_ID)) {
        continue;
      }

      // Aggiungi alla lista transazioni processate
      newTransactions.push(tx);
      processedCount++;

      // === FASE 1: PARSING ISTRUZIONI SAGE ===
      const parseResult = await parseSageInstructions({
        transaction: tx,
        opMap: context.constants.OP_MAP
      });

      // === FASE 2: CRAFTING DETECTION ===
      const craftingResult = await detectCrafting({
        transaction: tx,
        operation: parseResult.operation,
        isCrafting: parseResult.isCrafting,
        sageProgramId: context.constants.SAGE_PROGRAM_ID,
        materials: context.constants.MATERIALS
      });

      // === FASE 3: RECIPE DECODING (solo se crafting) ===
      let recipeResult: { decodedRecipe?: any; craftingMaterial?: string; craftingType?: string } = {};
      if (parseResult.isCrafting || craftingResult.craftingAction) {
        recipeResult = await decodeRecipeAccounts({
          transaction: tx,
          sharedPoolConnection: context.sharedPoolConnection,
          craftProgramId: context.constants.CRAFT_PROGRAM_ID,
          excludeAccounts: context.config.excludeAccounts
        });

        // Merge crafting material da recipe decoder se non trovato da detector
        if (recipeResult.craftingMaterial && !craftingResult.craftingMaterial) {
          craftingResult.craftingMaterial = recipeResult.craftingMaterial;
        }
        if (recipeResult.craftingType && !craftingResult.craftingType) {
          craftingResult.craftingType = recipeResult.craftingType;
        }
      }

      // === FASE 4: FLEET ASSOCIATION ===
      const fleetResult = await associateFleet({
        transaction: tx,
        operation: craftingResult.enhancedOperation || parseResult.operation,
        fleetAccounts: context.config.fleetAccounts,
        fleetAccountNames: context.config.fleetAccountNames,
        excludeAccounts: context.config.excludeAccounts
      });

      // === FASE 5: FEE AGGREGATION ===
      const aggregationResult = await aggregateFees({
        transaction: tx,
        operation: craftingResult.enhancedOperation || parseResult.operation,
        involvedFleetName: fleetResult.involvedFleetName,
        craftingDetails: craftingResult,
        sageProgramId: context.constants.SAGE_PROGRAM_ID
      });

      // Aggiorna strutture dati globali nel context
      mergeFeesUpdates(context.feesByFleet, aggregationResult.feesByFleetUpdate);
      mergeFeesUpdates(context.feesByOperation, aggregationResult.feesByOperationUpdate);

      // Aggiorna contatori unknown operations
      if (parseResult.operation === 'Unknown') {
        context.unknownOperations++;
      }

      // Aggiorna rented fleets se necessario
      if (fleetResult.involvedFleetName && context.config.fleetRentalStatus[fleetResult.involvedFleetName]) {
        context.rentedFleets.add(fleetResult.involvedFleetName);
      }

    } catch (error) {
      console.error(`[batch-processor] Error processing transaction ${tx.signature}:`, error);
      // Continua con la prossima transazione
    }
  }

  // Calcola percentuali alla fine del batch
  calculatePercentages(context);

  return {
    processedCount,
    feesUpdates: context.feesByFleet,
    operationUpdates: context.feesByOperation,
    newTransactions
  };
}

/**
 * Unisce aggiornamenti fee nelle strutture dati esistenti
 */
function mergeFeesUpdates(target: Record<string, any>, updates: Record<string, any>): void {
  for (const [key, update] of Object.entries(updates)) {
    if (!target[key]) {
      target[key] = update;
    } else {
      // Merge existing structure
      if (update.totalFee !== undefined) {
        target[key].totalFee += update.totalFee;
      }
      if (update.operations) {
        for (const [opKey, opUpdate] of Object.entries(update.operations) as [string, any][]) {
          if (!target[key].operations[opKey]) {
            target[key].operations[opKey] = opUpdate;
          } else {
            // Merge operation data
            const existingOp = target[key].operations[opKey];
            existingOp.count += opUpdate.count || 0;
            existingOp.totalFee += opUpdate.totalFee || 0;
            if (opUpdate.details) {
              existingOp.details.push(...opUpdate.details);
            }
          }
        }
      }
    }
  }
}

/**
 * Calcola percentuali e medie alla fine del batch
 */
function calculatePercentages(context: any): void {
  // Calcola avgFee per operations
  Object.keys(context.feesByOperation).forEach(op => {
    const opData = context.feesByOperation[op];
    opData.avgFee = opData.totalFee / opData.count;
  });

  // Calcola percentuali per fleet
  Object.keys(context.feesByFleet).forEach(fleet => {
    const fleetData = context.feesByFleet[fleet];
    fleetData.feePercentage = context.sageFees24h > 0 ? (fleetData.totalFee / context.sageFees24h) * 100 : 0;

    // Rimuovi Subwarp se details vuoto
    if (fleetData.operations['Subwarp'] &&
        Array.isArray(fleetData.operations['Subwarp'].details) &&
        fleetData.operations['Subwarp'].details.length === 0) {
      delete fleetData.operations['Subwarp'];
    }

    // Calcola percentuali per operazioni
    Object.keys(fleetData.operations).forEach(op => {
      const opData = fleetData.operations[op];
      opData.avgFee = opData.totalFee / opData.count;
      opData.percentageOfFleet = fleetData.totalFee > 0 ? (opData.totalFee / fleetData.totalFee) * 100 : 0;
    });
  });
}