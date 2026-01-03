import { AggregatorState, TxMeta, CraftingExtra } from '../types/wallet-fees-streaming-types';

export function accumulate(
  tx: any,
  meta: TxMeta,
  craftExtra: CraftingExtra,
  acc: AggregatorState,
  fleetRentalStatus: { [account: string]: boolean },
  fleetAccountNames: { [account: string]: string } = {}
): void {
  const { operation, groupedOperation, isCrafting, craftingType, craftingMaterial, involvedFleetKey, involvedFleetName, hasSageInstruction } = meta;
  const { decodedRecipe, craftingMaterial: enrichedMaterial, craftingType: enrichedType, craftingAction } = craftExtra;

  acc.totalFees24h += tx.fee;
  if (tx.programIds && tx.programIds.includes('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE')) {
    acc.sageFees24h += tx.fee;
  }

  // Aggiungi la transazione SAGE processata all'array per conteggi e timestamp
  (tx as any).operation = operation;
  acc.processedTransactions.push(tx);

  if (operation === 'Unknown') {
    acc.unknownOperations++;
  }

  // Aggregazione per fleet
  const fleetKey = involvedFleetKey;
  if (fleetKey) {
    if (!acc.feesByFleet[fleetKey]) {
      acc.feesByFleet[fleetKey] = {
        totalFee: 0,
        feePercentage: 0,
        totalOperations: 0,
        operations: {},
        isRented: fleetRentalStatus[fleetKey] || false
      };
    }

    acc.feesByFleet[fleetKey].totalFee += tx.fee;
  }

  // Compute composite operation
  const refineOp = (op: string): string => {
    if (op === 'FleetStateHandler' && tx.logMessages) {
      const logsJoined = tx.logMessages.join(' ');
      const logsLower = logsJoined.toLowerCase();
      if (logsLower.includes('movesubwarp') || logsLower.includes('stopsubwarp') || logsLower.includes('subwarp')) return 'FleetStateHandler_subwarp';
      if (logsLower.includes('mineasteroid') || logsLower.includes('stopmining') || logsLower.includes('mining')) return 'FleetStateHandler_mining';
      if (logsLower.includes('loadingbaytoidle') || logsLower.includes('idletoloadingbay')) return 'FleetStateHandler_loading_bay';
    }
    return op;
  };

  const opsToAggregate = (tx.instructions && tx.instructions.length > 0) ? tx.instructions : [operation];
  const refinedOps = opsToAggregate.map(refineOp).filter(Boolean);
  const compositeOperation = refinedOps.length > 0 ? Array.from(new Set(refinedOps)).join('') : refineOp(operation);
  const opKey = compositeOperation || refineOp(operation);

  // Update feesByFleet with composite operation
  if (fleetKey) {
    if (!acc.feesByFleet[fleetKey].operations[opKey]) {
      acc.feesByFleet[fleetKey].operations[opKey] = {
        count: 0,
        totalFee: 0,
        avgFee: 0,
        percentageOfFleet: 0,
        details: []
      };
    }
    acc.feesByFleet[fleetKey].operations[opKey].count++;
    acc.feesByFleet[fleetKey].operations[opKey].totalFee += tx.fee;

    if (isCrafting && (opKey === operation || opKey.toLowerCase().includes('craft'))) {
      acc.feesByFleet[fleetKey].operations[opKey].details.push({
        action: craftingAction,
        type: craftingAction,
        displayType: enrichedType || craftingType || 'Crafting',
        fee: tx.fee,
        material: enrichedMaterial || craftingMaterial,
        txid: tx.signature,
        fleet: fleetKey,
        decodedKind: decodedRecipe ? decodedRecipe.kind : undefined,
        decodedData: decodedRecipe ? decodedRecipe.data : undefined
      });
    }
  }

  // Update feesByOperation with same composite operation
  if (!acc.feesByOperation[opKey]) {
    acc.feesByOperation[opKey] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
  }
  acc.feesByOperation[opKey].count++;
  acc.feesByOperation[opKey].totalFee += tx.fee;

  if (isCrafting && (opKey === operation || opKey.toLowerCase().includes('craft'))) {
    acc.feesByOperation[opKey].details.push({
      action: craftingAction,
      type: craftingAction,
      displayType: enrichedType || craftingType || 'Crafting',
      fee: tx.fee,
      material: enrichedMaterial || craftingMaterial,
      txid: tx.signature,
      fleet: involvedFleetName,
      decodedKind: decodedRecipe ? decodedRecipe.kind : undefined,
      decodedData: decodedRecipe ? decodedRecipe.data : undefined
    });
  }
}

export function finalize(acc: AggregatorState): void {
  // Aggiornamento percentuali
  Object.keys(acc.feesByOperation).forEach(op => {
    acc.feesByOperation[op].avgFee = acc.feesByOperation[op].totalFee / acc.feesByOperation[op].count;
  });
  Object.keys(acc.feesByFleet).forEach(fleet => {
    acc.feesByFleet[fleet].feePercentage = acc.sageFees24h > 0 ? (acc.feesByFleet[fleet].totalFee / acc.sageFees24h) * 100 : 0;

    Object.keys(acc.feesByFleet[fleet].operations).forEach(op => {
      const opData = acc.feesByFleet[fleet].operations[op];
      opData.avgFee = opData.totalFee / opData.count;
      opData.percentageOfFleet = acc.feesByFleet[fleet].totalFee > 0 ? (opData.totalFee / acc.feesByFleet[fleet].totalFee) * 100 : 0;
    });
  });

  // Dopo aver processato il batch, aggiorna il totale operazioni per ogni flotta
  Object.values(acc.feesByFleet).forEach(fleetData => {
    const ops = Object.values((fleetData as any).operations) as any[];
    (fleetData as any).totalOperations = ops.reduce((sum, op) => sum + (op.count || 0), 0);
  });
}

export function pairCraftingTransactions(processedTxs: any[], windowSec: number = 30): any[] {
  const craftingPairs: Map<string, { start: any; complete: any | null }> = new Map();
  for (const tx of processedTxs) {
    const hasCreate = tx.instructions?.includes('CreateCraftingProcess');
    const hasClose = tx.instructions?.includes('CloseCraftingProcess');
    const hasBurn = tx.instructions?.includes('BurnConsumableIngredient') || tx.instructions?.includes('BurnCraftingConsumables');
    const hasClaim = tx.instructions?.includes('ClaimRecipeOutput') || tx.instructions?.includes('ClaimCraftingOutputs');

    const fleetName = (tx as any).involvedFleetName || ((tx as any).involvedFleets && (tx as any).involvedFleets[0]) || 'unknown';

    if (hasCreate) {
      const key = `craft_${tx.blockTime || 0}_${fleetName}`;
      craftingPairs.set(key, { start: tx, complete: null });
    } else if (hasClose && (hasBurn || hasClaim)) {
      // Find matching start within 30s
      for (const [k, pair] of Array.from(craftingPairs.entries()).reverse()) {
        const pairFleetName = (pair.start as any).involvedFleetName || ((pair.start as any).involvedFleets && (pair.start as any).involvedFleets[0]) || 'unknown';
        if (!pair.complete && pair.start && pairFleetName === fleetName) {
          const timeDelta = Math.abs((tx.blockTime || 0) - (pair.start.blockTime || 0));
          if (timeDelta < windowSec) {
            pair.complete = tx;
            break;
          }
        }
      }
    }
  }

  // Merge paired crafting transactions
  const pairedSignatures = new Set<string>();
  const mergedTransactions: any[] = [];
  for (const [key, pair] of craftingPairs.entries()) {
    if (pair.start && pair.complete) {
      pairedSignatures.add(pair.start.signature);
      pairedSignatures.add(pair.complete.signature);
      mergedTransactions.push({
        ...pair.start,
        signature: `${pair.start.signature}+${pair.complete.signature}`,
        fee: pair.start.fee + pair.complete.fee,
        instructions: [...(pair.start.instructions || []), ...(pair.complete.instructions || [])],
        pairedTxs: [pair.start.signature, pair.complete.signature],
        isPaired: true
      });
    } else if (pair.start) {
      mergedTransactions.push(pair.start);
    }
  }
  for (const tx of processedTxs) {
    if (!pairedSignatures.has(tx.signature)) {
      mergedTransactions.push(tx);
    }
  }
  return mergedTransactions;
}