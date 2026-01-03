import { TxMeta } from '../../types/wallet-fees-streaming-types';
import { excludeAccounts, MATERIALS } from '../../config/wallet-fees-streaming-config';

export interface ClassifyTxContext {
  accountToFleet: Map<string, string>;
  resolveFleetKey: (val?: string) => string | undefined;
  excludeAccounts: string[];
  MATERIALS: Record<string, string>;
  SAGE_PROGRAM_ID: string;
  fleetAccountNames: { [account: string]: string };
}

export function classifyTx(tx: any, ctx: ClassifyTxContext): TxMeta {
  const { accountToFleet, resolveFleetKey, excludeAccounts, MATERIALS, SAGE_PROGRAM_ID, fleetAccountNames } = ctx;

  let operation = 'Unknown';
  let isCrafting = false;
  let craftingType: string | undefined = undefined;
  let craftingMaterial: string | undefined = undefined;
  let hasSageInstruction = false;

  if (tx.instructions && tx.instructions.length > 0) {
    // Priorità alle istruzioni SAGE (nomi che iniziano con maiuscola e non sono generici)
    const sageIx = tx.instructions.find((ix: string) =>
      typeof ix === 'string' &&
      ix !== 'Unknown' &&
      !['ComputeBudget', 'Approve', 'Burn', 'Transfer', 'IncrementPoints'].includes(ix)
    );
    if (sageIx) {
      operation = sageIx;
      hasSageInstruction = true;
      if (sageIx.toLowerCase().includes('craft')) {
        isCrafting = true;
        craftingType = sageIx;
      }
    } else {
      operation = tx.instructions[0] || 'Unknown';
    }
  }

  if (operation === 'Unknown' && tx.logMessages) {
    for (const log of tx.logMessages) {
      const ixMatch = log.match(/Instruction:\s*(\w+)/);
      if (ixMatch) {
        operation = ixMatch[1];
        hasSageInstruction = true;
        if (operation.toLowerCase().includes('craft')) {
          isCrafting = true;
          craftingType = operation;
        }
        break;
      }
    }
  }

  // Raffinamento FleetStateHandler
  if (operation === 'FleetStateHandler' && tx.logMessages) {
    const logsJoined = tx.logMessages.join(' ');
    const logsLower = logsJoined.toLowerCase();
    if (logsLower.includes('movesubwarp') || logsLower.includes('stopsubwarp') || logsLower.includes('subwarp')) {
      operation = 'FleetStateHandler_subwarp';
    } else if (logsLower.includes('mineasteroid') || logsLower.includes('stopmining') || logsLower.includes('mining')) {
      operation = 'FleetStateHandler_mining';
    } else if (logsLower.includes('loadingbaytoidle') || logsLower.includes('idletoloadingbay')) {
      operation = 'FleetStateHandler_loading_bay';
    }
  }

  // Skip ONLY pure non-SAGE transactions (no SAGE program ID at all)
  if (!tx.programIds.includes(SAGE_PROGRAM_ID)) {
    return {
      operation: 'Non-SAGE',
      groupedOperation: 'Non-SAGE',
      isCrafting: false,
      hasSageInstruction: false,
    };
  }

  // Parsing innerInstructions per materiali (migliorato)
  if (isCrafting && tx.meta && Array.isArray((tx.meta as any).innerInstructions)) {
    for (const blk of (tx.meta as any).innerInstructions) {
      if (!blk || !Array.isArray(blk.instructions)) continue;
      for (const iin of blk.instructions) {
        // Prova a estrarre materiale da parsed, program, e dati
        const candidates = [iin?.parsed?.destination, iin?.parsed?.mint, iin?.parsed?.token, iin?.parsed?.authority, iin?.parsed?.source, iin?.program, iin?.data];
        for (const val of candidates) {
          if (typeof val === 'string') {
            if (/fuel/i.test(val)) craftingMaterial = 'Fuel';
            else if (/ore/i.test(val)) craftingMaterial = 'Ore';
            else if (/tool/i.test(val)) craftingMaterial = 'Tool';
            else if (/component/i.test(val)) craftingMaterial = 'Component';
            else if (/food/i.test(val)) craftingMaterial = 'Food';
            else if (/ammo/i.test(val)) craftingMaterial = 'Ammo';
            // Estendi con altri materiali noti
            else if (/metal/i.test(val)) craftingMaterial = 'Metal';
            else if (/fiber/i.test(val)) craftingMaterial = 'Fiber';
            else if (/chemical/i.test(val)) craftingMaterial = 'Chemical';
            else if (/circuit/i.test(val)) craftingMaterial = 'Circuit';
          }
          if (craftingMaterial) break;
        }
        if (craftingMaterial) break;
      }
      if (craftingMaterial) break;
    }
  }

  // Fallback: deduci Fuel/Food dai log/instructions se non trovato
  if (isCrafting && !craftingMaterial) {
    const logsLower = (tx.logMessages || []).join(' ').toLowerCase();
    const instrLower = (tx.instructions || []).join(' ').toLowerCase();
    const combinedLower = `${logsLower} ${instrLower}`;
    if (combinedLower.includes('fuel')) craftingMaterial = 'Fuel';
    else if (combinedLower.includes('food')) craftingMaterial = 'Food';
  }

  // Aggregazione per fleet - cerca fleet account o cargo hold
  let involvedFleetName: string | undefined = undefined;
  let involvedFleetKey: string | undefined = undefined;

  // First try: use the accountToFleet map for all account keys in the transaction
  if (tx.accountKeys) {
    for (const acc of tx.accountKeys) {
      const matchedFleetKey = accountToFleet.get(acc);
      if (matchedFleetKey) {
        involvedFleetKey = matchedFleetKey;
        involvedFleetName = fleetAccountNames[matchedFleetKey] || matchedFleetKey.substring(0, 8);
        break;
      }
    }
  }

  // Second try: categorize non-fleet operations (crafting, starbase, system ops)
  if (!involvedFleetName) {
    if (isCrafting || operation.includes('Craft')) {
      involvedFleetName = 'Crafting Operations';
    } else if (operation.includes('Starbase')) {
      involvedFleetName = 'Starbase Operations';
    } else if (operation.includes('Cargo')) {
      involvedFleetName = 'Cargo Management';
    } else if (operation.includes('Survey') || operation.includes('Scan')) {
      involvedFleetName = 'Survey & Discovery';
    } else if (operation.includes('Register') || operation.includes('Deregister') || operation.includes('Update') || operation.includes('Init')) {
      involvedFleetName = 'Configuration';
    } else if (operation.includes('Profile') || operation.includes('Progression') || operation.includes('Points')) {
      involvedFleetName = 'Player Profile';
    } else if (operation.includes('Rental')) {
      involvedFleetName = 'Fleet Rentals';
    } else if (operation.includes('Sector') || operation.includes('Planet') || operation.includes('Star')) {
      involvedFleetName = 'Universe Management';
    } else {
      // Default for any other SAGE operation
      involvedFleetName = 'Other Operations';
    }
  }

  // Raggruppa tutte le crafting sotto 'Crafting' per feesByFleet/feesByOperation
  let groupedOperation = operation;
  if (isCrafting && groupedOperation === 'Unknown') groupedOperation = 'Crafting';

  return {
    operation,
    groupedOperation,
    isCrafting,
    craftingType,
    craftingMaterial,
    involvedFleetKey,
    involvedFleetName,
    hasSageInstruction,
  };
}